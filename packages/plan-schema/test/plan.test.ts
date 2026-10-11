import { describe, expect, it } from "vitest";
import { LIMITS, formatPath, isValidTimeZone, plainEnglishSummary, textProblem, validatePlan } from "../src/index.js";

const files = import.meta.glob<unknown>("./fixtures/*.json", { eager: true, import: "default" });
const byName = new Map(
  Object.entries(files).map(([path, json]) => [path.replace(/^.*\/(.*)\.json$/, "$1"), json] as const),
);
// Fresh copy each time so tests can edit it freely.
const load = (name: string): any => {
  if (!byName.has(name)) throw new Error(`missing fixture ${name}`);
  return structuredClone(byName.get(name));
};
const names = [...byName.keys()];
const planOf = (name: string): any => {
  const r = validatePlan(load(name));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.plan;
};

// Each invalid fixture must fail with an error at this path whose message contains this text.
const EXPECTED: Record<string, [path: string, text: string]> = {
  "invalid-time-zone": ["time_zone", "IANA"],
  "invalid-time-zone-abbreviation": ["time_zone", "IANA"],
  "invalid-time-zone-lowercase": ["time_zone", "IANA"],
  "invalid-field-type": ["logs[0].fields[0].type", "must be one of"],
  "invalid-choice-no-options": ["logs[0].fields[2].options", "needs 1 to 30 options"],
  "invalid-choice-too-many-options": ["logs[0].fields[2].options", "needs 1 to 30 options"],
  "invalid-options-on-text": ["logs[0].fields[0].options", "Only choice"],
  "invalid-too-many-logs": ["logs", "at most 6 logs"],
  "invalid-too-many-fields": ["logs[0].fields", "at most 25 fields"],
  "invalid-too-many-routing-rules": ["routing_rules", "at most 20 routing rules"],
  "invalid-too-many-reminders": ["reminders", "at most 10 reminders"],
  "invalid-too-many-alerts": ["alerts", "at most 5 alerts"],
  "invalid-too-many-contributors": ["contributors", "at most 20 contributors"],
  "invalid-key-uppercase": ["logs[0].fields[0].key", "lowercase letters, numbers, and underscores"],
  "invalid-key-duplicate": ["logs[0].fields[1].key", "unique within a log"],
  "invalid-routing-from-missing": ["routing_rules[0].from", "does not match any log id"],
  "invalid-routing-copy-to-missing": ["routing_rules[0].copy_to", "does not match any log id"],
  "invalid-copy-fields-from-missing": ["logs[1].copy_fields_from", "does not match any log id"],
  "invalid-routing-self": ["routing_rules[0].copy_to", "to itself"],
  "invalid-routing-field-missing": ["routing_rules[0].when.field", "does not exist"],
  "invalid-routing-field-not-choice": ["routing_rules[0].when.field", "choice or multi_choice"],
  "invalid-routing-includes-not-option": ["routing_rules[0].when.includes", "not one of the options"],
  "invalid-routing-target-wrong-source": ["routing_rules[0].copy_to", "must have copy_fields_from set to"],
  "invalid-routing-target-has-own-fields": ["routing_rules[0].copy_to", "must have copy_fields_from set to"],
  "invalid-copy-fields-chain": ["logs[2].copy_fields_from", "Chains are not allowed"],
  "invalid-log-fields-and-copy": ["logs[1]", 'either "fields"'],
  "invalid-date-field-not-date": ["reminders[0].date_field", "must be a date field"],
  "invalid-date-field-missing": ["reminders[0].date_field", "does not exist"],
  "invalid-reminder-log-missing": ["reminders[0].log", "does not match any log id"],
  "invalid-notify-unknown-email": ["reminders[1].notify[0]", "not the owner or a contributor"],
  "invalid-notify-bad-target": ["alerts[0].notify[0]", '"owner", "contributors", or an email'],
  "invalid-notify-contributors-none": ["alerts[0].notify[0]", "no contributors"],
  "invalid-email-invalid": ["owner.email", "valid email"],
  "invalid-send-hour-24": ["reminders[1].send_hour", "0 to 23"],
  "invalid-send-hour-fraction": ["reminders[1].send_hour", "whole number"],
  "invalid-string-too-long-name": ["system_name", "at most 80 characters"],
  "invalid-string-too-long-option": ["logs[0].fields[2].options[0]", "at most 60 characters"],
  "invalid-text-starts-equals": ["logs[0].name", 'starts with "="'],
  "invalid-text-starts-at": ["logs[0].fields[0].label", 'starts with "@"'],
  "invalid-text-plus-digit": ["logs[0].fields[4].options[0]", 'starts with "+"'],
  "invalid-text-minus-paren": ["logs[0].fields[0].label", 'starts with "-"'],
  "invalid-text-control-char": ["owner.name", "control character"],
  "invalid-text-whitespace-formula": ["system_name", 'starts with "="'],
  "invalid-text-empty-after-trim": ["system_name", "must not be empty"],
  "invalid-unknown-property": ["(plan)", 'Unknown property "script"'],
  "invalid-missing-required-property": ["owner", "missing"],
  "invalid-wrong-schema-version": ["schema_version", "must be 1"],
  "invalid-weekly-bad-day": ["reminders[1].day", "MON, TUE"],
  "invalid-reminder-bad-type": ["reminders[1].type", "Reminder type"],
  "invalid-not-an-object": ["(plan)", "object"],
};

describe("fixtures", () => {
  it("has at least 20 fixtures and an expectation for every invalid one", () => {
    expect(names.length).toBeGreaterThanOrEqual(20);
    const invalid = names.filter((n) => n.startsWith("invalid-")).sort();
    expect(invalid).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const name of names.filter((n) => n.startsWith("valid-"))) {
    it(`${name} passes`, () => {
      const r = validatePlan(load(name));
      expect(r.ok, JSON.stringify(r)).toBe(true);
    });
  }

  for (const [name, [path, text]] of Object.entries(EXPECTED)) {
    it(`${name} fails at ${path}`, () => {
      const r = validatePlan(load(name));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const hit = r.errors.find((e) => e.path === path && e.message.includes(text));
      expect(hit, JSON.stringify(r.errors, null, 1)).toBeDefined();
    });
  }
});

describe("validatePlan", () => {
  it("returns the plan with defaults filled in", () => {
    const r = validatePlan(load("valid-minimal"));
    expect(r.ok && r.plan.contributors).toEqual([]);
    expect(r.ok && r.plan.routing_rules).toEqual([]);
  });

  it("trims whitespace in text", () => {
    const p = load("valid-example");
    p.system_name = "  Spaced Name  ";
    const r = validatePlan(p);
    expect(r.ok && r.plan.system_name).toBe("Spaced Name");
  });

  it("error shape is {path, message} with plain strings and no raw zod text", () => {
    const r = validatePlan(load("invalid-routing-includes-not-option"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const e of r.errors) {
      expect(Object.keys(e).sort()).toEqual(["message", "path"]);
      expect(typeof e.path).toBe("string");
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.message).not.toMatch(/Invalid input|Expected .* received/);
    }
  });

  it("reports several problems at once", () => {
    const p = load("valid-example");
    p.time_zone = "Nope/Nope";
    p.owner.email = "bad";
    const r = validatePlan(p);
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["time_zone", "owner.email"]));
  });

  it("never throws on junk input", () => {
    for (const junk of [null, undefined, 5, "text", [], {}]) {
      expect(validatePlan(junk).ok).toBe(false);
    }
  });

  it("accepts the maximum allowed sizes", () => {
    const p = load("valid-minimal");
    p.logs = Array.from({ length: LIMITS.maxLogs }, (_, i) => ({
      id: `log${i}`,
      name: `Log ${i}`,
      fields: Array.from({ length: LIMITS.maxFieldsPerLog }, (_, j) => ({ key: `f${j}`, label: `Field ${j}`, type: "text", required: false })),
    }));
    p.contributors = Array.from({ length: LIMITS.maxContributors }, (_, i) => ({ name: `Rep ${i}`, email: `rep${i}@example.com`, role: "contributor" }));
    p.alerts = Array.from({ length: LIMITS.maxAlerts }, () => ({ on: "new_entry", when_entered_by: "contributor", notify: ["owner"] }));
    p.reminders = Array.from({ length: LIMITS.maxReminders }, () => ({ type: "weekly_digest", day: "FRI", send_hour: 23, notify: ["contributors"] }));
    p.system_name = "x".repeat(LIMITS.maxNameLength);
    const r = validatePlan(p);
    expect(r.ok, JSON.stringify(!r.ok && r.errors)).toBe(true);
  });

  it("allows a date reminder on a copy log (it shares the source columns)", () => {
    const p = load("valid-example");
    p.reminders[0].log = "education";
    expect(validatePlan(p).ok).toBe(true);
  });
});

describe("text safety rule", () => {
  const allowed = ["- Other -", "+ Add new", "Q&A", "A=B", "Email (primary)", "-", "Café", "  padded  "];
  const rejected = ["=1+1", "@user", "+1 phone", "-5", "+(1)", "-(1)", "a\nb", "a\u0000b", "a\u007Fb"];
  it.each(allowed)("allows %j", (s) => expect(textProblem(s.trim())).toBeNull());
  it.each(rejected)("rejects %j", (s) => expect(textProblem(s)).not.toBeNull());

  it("also protects options, person names, and emails", () => {
    const p = load("valid-example");
    p.contributors[0].name = "=cmd";
    expect(validatePlan(p).ok).toBe(false);
    const q = load("valid-example");
    q.contributors[0].email = "+1@example.com";
    expect(validatePlan(q).ok).toBe(false);
  });
});

describe("time zones", () => {
  it.each(["America/Chicago", "Europe/London", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "UTC"])("accepts %s", (tz) => expect(isValidTimeZone(tz)).toBe(true));
  it.each(["", "CST", "+01:00", "Mars/Olympus", "america/chicago", "America/Chicago; DROP", "Chicago"])("rejects %j", (tz) => expect(isValidTimeZone(tz)).toBe(false));
});

describe("formatPath", () => {
  it("writes array indexes in brackets", () => {
    expect(formatPath(["logs", 1, "fields", 0, "key"])).toBe("logs[1].fields[0].key");
    expect(formatPath([])).toBe("(plan)");
  });
});

describe("plainEnglishSummary", () => {
  const summary = plainEnglishSummary(planOf("valid-example"));

  it("describes logs, routing, reminders, and alerts in plain words", () => {
    expect(summary).toContain('Your system "Employer Outreach Log"');
    expect(summary).toContain("I will create 2 logs");
    expect(summary).toContain('"All Employers" with 7 fields');
    expect(summary).toContain('"Education Log" with the same fields as "All Employers"');
    expect(summary).toContain('has Area including "Education", I will also copy it to "Education Log"');
    expect(summary).toContain("Every Monday at 8:00 AM Central Time (America/Chicago), I will email the owner (owner@example.com) a weekly digest");
    expect(summary).toContain('1 day before each "Follow-up date" date in "All Employers", at 8:00 AM');
    expect(summary).toContain("When a contributor adds a new entry, I will email the owner (owner@example.com).");
  });

  it("is deterministic and has no em dashes", () => {
    const again = plainEnglishSummary(planOf("valid-example"));
    expect(again).toBe(summary);
    expect(summary).not.toContain("\u2014");
  });

  it("handles edge cases: same-day, midnight, contributors, plural people", () => {
    const s = plainEnglishSummary(planOf("valid-edge-cases"));
    expect(s).toContain("On the day each");
    expect(s).toContain("12:00 AM");
    expect(s).toContain("rep@example.com");
    expect(s).toContain("all contributors (1 person)");
  });

  it("handles the minimal plan without empty sections", () => {
    const s = plainEnglishSummary(planOf("valid-minimal"));
    expect(s).toContain("I will create 1 log:");
    expect(s).not.toMatch(/Reminders:|Alerts:|Copying entries/);
    expect(s).toContain("UTC");
  });

  it("does not change the plan", () => {
    const plan = planOf("valid-example");
    const before = JSON.stringify(plan);
    plainEnglishSummary(plan);
    expect(JSON.stringify(plan)).toBe(before);
  });
});
