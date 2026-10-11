import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_BYTES,
  PlannerReplySchema,
  isValidTimeZone,
  plainEnglishSummary,
  textProblem,
  validatePlan,
  validatePlannerReply,
} from "../src/index.js";

const files = import.meta.glob<unknown>("./fixtures/*.json", { eager: true, import: "default" });
const base = (): any => {
  const entry = Object.entries(files).find(([p]) => p.endsWith("/valid-example.json"));
  return structuredClone(entry![1]);
};
const errorsOf = (p: unknown) => {
  const r = validatePlan(p);
  return r.ok ? [] : r.errors;
};
const has = (p: unknown, path: string, text: string) =>
  errorsOf(p).some((e) => e.path === path && e.message.includes(text));
const timed = <T>(fn: () => T): [T, number] => {
  const t = performance.now();
  const v = fn();
  return [v, performance.now() - t];
};

describe("1. linear email check", () => {
  it("rejects a hostile email in under 200 ms", () => {
    const p = base();
    p.owner.email = "a@" + ".".repeat(50000) + "@";
    const [r, ms] = timed(() => validatePlan(p));
    expect(r.ok).toBe(false);
    expect(ms).toBeLessThan(200);
  });
  it("does not run regexes on over-long text", () => {
    const p = base();
    p.system_name = "=" + "a".repeat(200000);
    const [r, ms] = timed(() => validatePlan(p));
    expect(r.ok).toBe(false);
    expect(ms).toBeLessThan(200);
    expect(errorsOf(p).every((e) => e.message.length < 300)).toBe(true);
  });
  it("still accepts normal emails", () => {
    for (const e of ["a@b.co", "first.last+tag@sub.example.org"]) {
      const p = base();
      p.owner.email = e;
      expect(validatePlan(p).ok, e).toBe(true);
    }
    for (const e of ["a@b", "a@.com", "a@b..com", "a@@b.com", "a b@c.com", "a@b.com."]) {
      const p = base();
      p.owner.email = e;
      expect(validatePlan(p).ok, e).toBe(false);
    }
  });
});

describe("2. oversized input", () => {
  it("rejects a huge plan quickly with one small error list", () => {
    const p = base();
    p.logs[0].fields[2].options = Array.from({ length: 3000 }, (_, i) => `Option ${i}`);
    p.routing_rules = Array.from({ length: 3000 }, () => ({ from: "main", when: { field: "interaction", includes: "Nope" }, copy_to: "education" }));
    const [r, ms] = timed(() => validatePlan(p));
    expect(r.ok).toBe(false);
    expect(ms).toBeLessThan(500);
    if (r.ok) return;
    expect(r.errors.length).toBeLessThanOrEqual(26);
    expect(JSON.stringify(r.errors).length).toBeLessThan(5000);
    expect(r.errors[0]!.message).toMatch(/too large/);
  });
  it("exports the byte cap", () => expect(MAX_PLAN_BYTES).toBe(64 * 1024));
  it("caps the error list at 25 plus a final 'and N more problems'", () => {
    const p = base();
    p.contributors = Array.from({ length: 20 }, (_, i) => ({ name: `R${i}`, email: "bad", role: "contributor" }));
    p.logs = Array.from({ length: 6 }, (_, i) => ({
      id: `l${i}`,
      name: `L${i}`,
      fields: Array.from({ length: 25 }, (_, j) => ({ key: `K${j}`, label: `F${j}`, type: "text", required: false })),
    }));
    p.routing_rules = [];
    p.reminders = [];
    p.alerts = [];
    const r = validatePlan(p);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBe(26);
    expect(r.errors[25]!.message).toMatch(/^and \d+ more problems$/);
  });
  it("runs cross checks only when the object-level parse succeeds", () => {
    const p = base();
    p.owner.email = "bad";
    p.routing_rules[0].copy_to = "nowhere";
    const paths = errorsOf(p).map((e) => e.path);
    expect(paths).toContain("owner.email");
    expect(paths).not.toContain("routing_rules[0].copy_to");
  });
  it("does not throw on input JSON.stringify cannot handle", () => {
    const cyc: any = {};
    cyc.self = cyc;
    expect(validatePlan(cyc).ok).toBe(false);
    expect(validatePlan({ a: 10n }).ok).toBe(false);
  });
  it("never echoes the options list", () => {
    const p = base();
    p.routing_rules[0].when.includes = "Nope";
    const e = errorsOf(p).find((x) => x.path === "routing_rules[0].when.includes")!;
    expect(e.message).not.toContain("Psychology");
    expect(e.message).toMatch(/not one of the options/);
  });
});

describe("3. time zones (pinned allowlist)", () => {
  it.each(["America/Chicago", "America/Argentina/Buenos_Aires", "America/Indiana/Indianapolis", "Asia/Kolkata", "Europe/London", "Pacific/Honolulu", "Australia/Sydney", "Africa/Johannesburg", "Atlantic/Reykjavik", "Indian/Maldives", "UTC"])("accepts %s", (tz) => expect(isValidTimeZone(tz)).toBe(true));
  it.each(["US/Eastern", "Etc/GMT+5", "Etc/UTC", "us/eastern", "america/chicago", "AMERICA/CHICAGO", "Asia/Calcutta", "GMT", "EST", "CST", "+01:00", "UTC+1", "utc", "Antarctica/McMurdo", "", "America/Chicago "])("rejects %j", (tz) => expect(isValidTimeZone(tz)).toBe(false));
  it("rejects a time_zone longer than 64 characters without running anything else", () => {
    const p = base();
    p.time_zone = "America/" + "x".repeat(100);
    expect(has(p, "time_zone", "at most 64")).toBe(true);
  });
  it("summary uses the pinned table", () => {
    const mk = (tz: string) => {
      const p = base();
      p.time_zone = tz;
      const r = validatePlan(p);
      if (!r.ok) throw new Error(JSON.stringify(r.errors));
      return plainEnglishSummary(r.plan);
    };
    expect(mk("America/Chicago")).toContain("Central Time (America/Chicago)");
    expect(mk("America/New_York")).toContain("Eastern Time (America/New_York)");
    expect(mk("Asia/Kolkata")).toContain("India Time (Asia/Kolkata)");
    expect(mk("Asia/Kabul")).toContain("the time zone Asia/Kabul.");
    expect(mk("UTC")).toContain("the time zone UTC.");
  });
});

describe("4. reserved log names", () => {
  it.each(["_plan", "Setup", "ACTIVITY", "Entries", "Form Responses 1", "_anything", "  setup  ", "Ｓｅｔｕｐ"])("rejects log name %j", (n) => {
    const p = base();
    p.logs[0].name = n;
    expect(has(p, "logs[0].name", "used by the system")).toBe(true);
  });
  it("allows names that merely contain a reserved word", () => {
    const p = base();
    p.logs[0].name = "Setup Visits";
    expect(validatePlan(p).ok).toBe(true);
  });
});

describe("5. unicode in the text rule", () => {
  it.each([
    ["line separator", "a\u2028b"],
    ["paragraph separator", "a\u2029b"],
    ["bidi override", "a\u202Eb"],
    ["zero width space", "a\u200Bb"],
    ["zero width space before =", "\u200B=SUM(A1)"],
    ["tag character", "a\u{E0049}b"],
    ["private use", "a\uE000b"],
    ["lone surrogate", "a\uD800b"],
    ["BOM", "a\uFEFFb"],
  ])("rejects %s", (_n, s) => expect(textProblem(s)).not.toBeNull());
  it("normalises full-width lead characters before the formula check", () => {
    expect(textProblem("＝SUM(A1)")).not.toBeNull(); // full-width "="
  });
  it("normalises the stored value to NFKC", () => {
    const p = base();
    p.system_name = "ＡＢＣ"; // full-width ABC
    const r = validatePlan(p);
    expect(r.ok && r.plan.system_name).toBe("ABC");
  });
  it("rejects a zero-width space inside a log name", () => {
    const p = base();
    p.logs[1].name = "Education\u200B Log";
    expect(has(p, "logs[1].name", "hidden")).toBe(true);
  });
  it("catches a look-alike duplicate log name after normalisation", () => {
    const p = base();
    p.logs[1].name = "Ａll Employers"; // full-width A
    expect(has(p, "logs[1].name", "used twice")).toBe(true);
  });
  it("catches look-alike duplicate options", () => {
    const p = base();
    p.logs[0].fields[2].options = ["Email", "Ｅmail"];
    expect(has(p, "logs[0].fields[2].options[1]", "more than once")).toBe(true);
  });
});

describe("6. error message hygiene", () => {
  it("truncates echoed values to 40 chars plus an ellipsis", () => {
    const p = base();
    p.time_zone = "Mars/" + "y".repeat(50);
    const m = errorsOf(p).find((e) => e.path === "time_zone")!.message;
    expect(m).toContain("Mars/" + "y".repeat(35) + "...");
    expect(m).not.toContain("y".repeat(36));
  });
  it("lists at most 5 unknown keys then 'and N more'", () => {
    const p = base();
    for (let i = 0; i < 9; i++) p["extra" + i] = 1;
    const m = errorsOf(p).find((e) => e.message.startsWith("Unknown"))!.message;
    expect(m).toContain('"extra0"');
    expect(m).toContain('"extra4"');
    expect(m).not.toContain('"extra5"');
    expect(m).toContain("and 4 more");
  });
  it("truncates long unknown key names", () => {
    const p = base();
    p["k".repeat(500)] = 1;
    const m = errorsOf(p).find((e) => e.message.startsWith("Unknown"))!.message;
    expect(m.length).toBeLessThan(300);
  });
  it("truncates an echoed routing value", () => {
    const p = base();
    p.routing_rules[0].when.includes = "z".repeat(60);
    const m = errorsOf(p).find((e) => e.path === "routing_rules[0].when.includes")!.message;
    expect(m).not.toContain("z".repeat(41));
  });
});

describe("7. reserved key names", () => {
  it.each(["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf", "entry_id", "entered_by", "entered_at"])("rejects field key %s", (k) => {
    const p = base();
    p.logs[0].fields[0].key = k;
    expect(has(p, "logs[0].fields[0].key", "reserved")).toBe(true);
  });
  it("rejects a reserved log id", () => {
    const p = base();
    p.logs[1].id = "constructor";
    expect(has(p, "logs[1].id", "reserved")).toBe(true);
  });
});

describe("8. commas in options", () => {
  it.each(["choice", "multi_choice"])("rejects a comma in a %s option", (type) => {
    const p = base();
    p.logs[0].fields[2].type = type;
    p.logs[0].fields[2].options = ["Fine", "Smith, John"];
    expect(has(p, "logs[0].fields[2].options[1]", "comma")).toBe(true);
  });
});

describe("10. extra validator checks", () => {
  it("at most one weekly_digest", () => {
    const p = base();
    p.reminders.push({ type: "weekly_digest", day: "FRI", send_hour: 9, notify: ["owner"] });
    expect(has(p, "reminders[2]", "weekly_digest")).toBe(true);
  });
  it("an alert requires a contributor", () => {
    const p = base();
    p.contributors = [];
    expect(has(p, "alerts[0]", "at least one contributor")).toBe(true);
  });
  it("owner cannot also be a contributor", () => {
    const p = base();
    p.contributors[0].email = "OWNER@example.com";
    expect(has(p, "contributors[0].email", "owner")).toBe(true);
  });
  it("duplicate routing rules rejected", () => {
    const p = base();
    p.routing_rules.push(structuredClone(p.routing_rules[0]));
    expect(has(p, "routing_rules[1]", "duplicate")).toBe(true);
  });
  it("duplicate notify entries rejected", () => {
    const p = base();
    p.reminders[0].notify = ["owner", "owner"];
    expect(has(p, "reminders[0].notify[1]", "more than once")).toBe(true);
    const q = base();
    q.reminders[0].notify = ["owner", "OWNER@example.com", "rep@example.com"];
    expect(errorsOf(q).length).toBe(0);
  });
  it("duplicate field labels rejected case-insensitively", () => {
    const p = base();
    p.logs[0].fields[1].label = "organization";
    expect(has(p, "logs[0].fields[1].label", "more than once")).toBe(true);
  });
});

describe("11. sign rule", () => {
  it.each(["+SUM(A1)", "-A1", "+1 phone", "-5", "+(1)", "-(1)", "+x", "-Other"])("rejects %j", (s) => expect(textProblem(s)).not.toBeNull());
  it.each(["- Other -", "+ Add new", "-", "+", "a-b", "Q+A"])("allows %j", (s) => expect(textProblem(s)).toBeNull());
});

describe("12. planner reply envelope", () => {
  const good = (): any => ({ plan: base(), follow_up_questions: [], unsupported_requests: ["WhatsApp is not supported"] });
  it("accepts a good reply and returns the validated plan", () => {
    const r = validatePlannerReply(good());
    expect(r.ok && r.reply.plan?.system_name).toBe("Employer Outreach Log");
  });
  it("accepts null plan with follow-up questions", () => {
    const r = validatePlannerReply({ plan: null, follow_up_questions: ["Who is the owner?"], unsupported_requests: [] });
    expect(r.ok).toBe(true);
  });
  it("rejects null plan without questions", () => {
    const r = validatePlannerReply({ plan: null, follow_up_questions: [], unsupported_requests: [] });
    expect(!r.ok && r.errors[0]!.message).toMatch(/follow-up question/);
  });
  it("rejects too many questions, entries, and long text", () => {
    const a = good();
    a.follow_up_questions = ["a", "b", "c"];
    expect(validatePlannerReply(a).ok).toBe(false);
    const b = good();
    b.unsupported_requests = Array.from({ length: 21 }, () => "x");
    expect(validatePlannerReply(b).ok).toBe(false);
    const c = good();
    c.unsupported_requests = ["x".repeat(201)];
    expect(validatePlannerReply(c).ok).toBe(false);
  });
  it("applies the text safety rule and rejects unknown keys", () => {
    const a = good();
    a.unsupported_requests = ["=HYPERLINK(1)"];
    expect(validatePlannerReply(a).ok).toBe(false);
    expect(validatePlannerReply({ ...good(), extra: 1 }).ok).toBe(false);
  });
  it("reports plan problems with a plan. path prefix", () => {
    const a = good();
    a.plan.owner.email = "bad";
    const r = validatePlannerReply(a);
    expect(!r.ok && r.errors.some((e) => e.path === "plan.owner.email")).toBe(true);
  });
  it("never throws on junk and exposes the schema", () => {
    for (const j of [null, 1, "x", [], {}]) expect(validatePlannerReply(j).ok).toBe(false);
    expect(PlannerReplySchema).toBeDefined();
  });
});
