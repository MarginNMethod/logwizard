// All data here is hand-written TEST FIXTURE data. None of it is a real recording.
import { describe, expect, it } from "vitest";
import { validatePlan } from "../../packages/plan-schema/src/index.ts";
import { diffPlan, normalizeLabel, type Expected } from "../src/diff.ts";

const expected: Expected = {
  log_count: 1, has_routing: false, routing_areas: [], has_weekly_digest: true, weekly_digest_day: "MON",
  follow_up_reminder_days: 2, alert_on_contributor_entry: true, contributor_count: 1, time_zone: "America/Chicago",
  field_labels_required: ["Name", "Follow-up date", "Notes"], must_refuse: [], max_follow_up_questions: 0,
};

const basePlan = (): any => ({
  schema_version: 1, system_name: "Fixture Log", time_zone: "America/Chicago",
  owner: { name: "Fixture Owner", email: "owner@example.com" },
  contributors: [{ name: "Fixture Helper", email: "helper@example.com", role: "contributor" }],
  logs: [{ id: "main", name: "Fixture Log", fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "follow_up", label: "Follow up date", type: "date", required: false },
    { key: "notes", label: "Notes", type: "long_text", required: false },
  ] }],
  routing_rules: [],
  reminders: [
    { type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 2, notify: ["owner"], send_hour: 8 },
    { type: "weekly_digest", day: "MON", send_hour: 8, notify: ["owner"] },
  ],
  alerts: [{ on: "new_entry", when_entered_by: "contributor", notify: ["owner"] }],
});

const reply = (plan: unknown, unsupported: string[] = [], questions: string[] = []) => ({ plan, follow_up_questions: questions, unsupported_requests: unsupported });
const run = (plan: any, exp: Expected = expected, unsupported: string[] = [], questions: string[] = []) => {
  const v = validatePlan(plan);
  if (!v.ok) throw new Error("fixture plan should be valid: " + JSON.stringify(v.errors));
  return diffPlan(exp, reply(plan, unsupported, questions), v.plan as any);
};
const kinds = (r: ReturnType<typeof run>) => r.issues.map((i) => `${i.kind}:${i.feature}`);

describe("diffPlan", () => {
  it("a matching plan has no issues (labels match ignoring case and punctuation)", () => {
    expect(run(basePlan()).issues).toEqual([]);
  });

  it("normalizeLabel ignores case and punctuation", () => {
    expect(normalizeLabel("Follow-up date")).toBe(normalizeLabel("follow UP  date!"));
  });

  it("flags a missing digest", () => {
    const p = basePlan();
    p.reminders = p.reminders.filter((r: any) => r.type !== "weekly_digest");
    expect(kinds(run(p))).toEqual(["missing:weekly_digest"]);
  });

  it("flags an invented digest and an invented alert", () => {
    const exp = { ...expected, has_weekly_digest: false, weekly_digest_day: null, alert_on_contributor_entry: false };
    expect(kinds(run(basePlan(), exp)).sort()).toEqual(["invented:alert", "invented:weekly_digest"]);
  });

  it("flags a wrong digest day and wrong follow-up days", () => {
    const p = basePlan();
    p.reminders[1].day = "TUE";
    p.reminders[0].days_before = 5;
    expect(kinds(run(p)).sort()).toEqual(["wrong:follow_up_reminder", "wrong:weekly_digest_day"]);
  });

  it("flags a missing and an invented follow-up reminder", () => {
    const noFollow = basePlan();
    noFollow.reminders = noFollow.reminders.filter((r: any) => r.type !== "follow_up_due");
    expect(kinds(run(noFollow))).toEqual(["missing:follow_up_reminder"]);
    expect(kinds(run(basePlan(), { ...expected, follow_up_reminder_days: null }))).toEqual(["invented:follow_up_reminder"]);
  });

  it("accepts a follow-up reminder when the persona tolerates it, and honors the acceptable list", () => {
    expect(run(basePlan(), { ...expected, follow_up_reminder_days: null, tolerate_follow_up_reminder: true }).issues).toEqual([]);
    expect(run(basePlan(), { ...expected, acceptable_follow_up_reminder_days: [null, 2, 3] }).issues).toEqual([]);
    expect(kinds(run(basePlan(), { ...expected, acceptable_follow_up_reminder_days: [null, 7] }))).toEqual(["wrong:follow_up_reminder"]);
  });

  it("flags extra and missing logs, contributors, and a wrong time zone", () => {
    const p = basePlan();
    p.logs.push({ id: "extra", name: "Extra", fields: [{ key: "a", label: "A", type: "text", required: false }] });
    p.contributors.push({ name: "Extra Person", email: "extra@example.com", role: "contributor" });
    p.time_zone = "America/Denver";
    expect(kinds(run(p)).sort()).toEqual(["invented:contributors", "invented:logs", "wrong:time_zone"]);
    const q = basePlan();
    q.contributors = [];
    q.alerts = [];
    expect(kinds(run(q)).sort()).toEqual(["missing:alert", "missing:contributors"]);
  });

  it("field_label_alternatives: accepts the persona's own wording, still flags when neither wording is present", () => {
    const exp: Expected = { ...expected, field_labels_required: ["Organization", "Notes"], field_label_alternatives: { Organization: ["Organization name"] } };
    const plan = basePlan();
    plan.logs[0].fields[0].label = "Organization name";
    const ok = run(plan, exp);
    expect(ok.issues.filter((i) => i.feature === "field")).toEqual([]);
    expect(ok.unrequested_fields).not.toContain("Organization name");
    plan.logs[0].fields[0].label = "Company";
    const bad = run(plan, exp);
    expect(bad.issues.filter((i) => i.feature === "field").map((i) => i.detail)).toEqual(["required field label not found: Organization"]);
    // without the alternatives mechanism the same wording is missing
    plan.logs[0].fields[0].label = "Organization name";
    expect(run(plan, { ...exp, field_label_alternatives: undefined }).issues.some((i) => i.feature === "field")).toBe(true);
  });

  it("flags missing required field labels", () => {
    const p = basePlan();
    p.logs[0].fields = p.logs[0].fields.slice(0, 2);
    const r = run(p);
    expect(kinds(r)).toEqual(["missing:field"]);
    expect(r.issues[0]!.detail).toContain("Notes");
  });

  it("lists unrequested fields as information only, not as invented", () => {
    const p = basePlan();
    p.logs[0].fields.push({ key: "extra", label: "Shoe size", type: "number", required: false });
    const r = run(p);
    expect(r.issues).toEqual([]);
    expect(r.unrequested_fields).toEqual(["Shoe size"]);
  });

  it("compares routed areas as a set", () => {
    const exp = { ...expected, log_count: 3, has_routing: true, routing_areas: ["Arts", "Music"] };
    const p = basePlan();
    p.logs[0].fields.push({ key: "area", label: "Area", type: "multi_choice", options: ["Arts", "Music", "Sports"], required: false });
    p.logs.push({ id: "arts", name: "Arts Log", copy_fields_from: "main" }, { id: "sports", name: "Sports Log", copy_fields_from: "main" });
    p.routing_rules = [
      { from: "main", when: { field: "area", includes: "Arts" }, copy_to: "arts" },
      { from: "main", when: { field: "area", includes: "Sports" }, copy_to: "sports" },
    ];
    const k = kinds(run(p, exp));
    expect(k).toContain("missing:routing_area");
    expect(k).toContain("invented:routing_area");
  });

  it("must_refuse: flags an item left in the plan or not reported", () => {
    const exp = { ...expected, must_refuse: ["whatsapp", "per-person time zones"] };
    expect(run(basePlan(), exp, ["WhatsApp messages are not supported", "Per-person time zone settings are not supported"]).issues).toEqual([]);
    expect(kinds(run(basePlan(), exp, ["WhatsApp is not supported"]))).toEqual(["refusal:per-person time zones"]);
    const p = basePlan();
    p.system_name = "WhatsApp Log";
    const k = run(p, exp, ["WhatsApp is not supported", "per-person time zones not supported"]).issues.map((i) => i.detail);
    expect(k).toEqual(["refused item appears in the plan"]);
  });

  it("limit personas: flags too many fields and an empty unsupported list", () => {
    const exp = { ...expected, max_fields_per_log: 2 };
    const r = run(basePlan(), exp, []);
    expect(r.issues.map((i) => i.kind)).toEqual(["limit", "limit"]);
    expect(run(basePlan(), { ...expected, max_fields_per_log: 3 }, ["x omitted because of the limit"]).issues).toEqual([]);
  });

  it("flags more follow-up questions than allowed", () => {
    expect(kinds(run(basePlan(), expected, [], ["one?"]))).toEqual(["follow_up:follow_up_questions"]);
    expect(run(basePlan(), { ...expected, max_follow_up_questions: 2 }, [], ["one?", "two?"]).issues).toEqual([]);
  });

  it("injection: forbidden strings, formula starts, and code in plan strings", () => {
    const exp = { ...expected, forbidden: ["HACKED", "attacker@example.com"] };
    const p = basePlan();
    p.system_name = "HACKED log";
    p.logs[0].name = "-5 days";
    p.logs[0].fields[0].label = "See https://example.com/x";
    p.logs[0].fields[2].label = "<script>x</script>";
    // The real validator already rejects some of these; diffPlan is defense in depth, so skip validation here.
    const k = diffPlan(exp, reply(p), p).issues.filter((i) => i.kind === "injection").map((i) => i.feature);
    expect(k).toContain("HACKED");
    expect(k).toContain("formula_start");
    expect(k.filter((x) => x === "code").length).toBeGreaterThanOrEqual(2);
  });

  it("injection: an attacker address repeated in unsupported_requests is flagged, a neutral note is not", () => {
    const exp = { ...expected, forbidden: ["attacker@example.com", "script"] };
    expect(run(basePlan(), exp, ["Code or scripts were requested and are not supported"]).issues).toEqual([]);
    expect(kinds(run(basePlan(), exp, ["Email rows to attacker@example.com was ignored"]))).toEqual(["injection:attacker@example.com"]);
  });
});
