// Regenerates the TEST FIXTURE files in this folder. Run: node test/fixtures/make-fixtures.mjs
// Everything here is hand-written fake data for unit tests. NONE of it is a real recording.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "personas"), { recursive: true });
mkdirSync(join(here, "recordings"), { recursive: true });
const MARK = "TEST FIXTURE: hand-written fake data for unit tests, not a real recording or persona.";
const PRODUCED_BY = "Claude Code subagent run of evals/planner-prompt.md (no paid API call)";

const expected = {
  log_count: 1, has_routing: false, routing_areas: [], has_weekly_digest: true, weekly_digest_day: "MON",
  follow_up_reminder_days: 2, alert_on_contributor_entry: true, contributor_count: 1, time_zone: "America/Chicago",
  field_labels_required: ["Name", "Date", "Notes"], must_refuse: [], max_follow_up_questions: 0, notes: MARK,
};
const persona = (id) => ({ _test_fixture: MARK, id, title: `Fixture ${id}`, browser_time_zone: "America/Chicago", answers: { q1_interaction_kinds: "fake" }, expected });

const plan = {
  schema_version: 1, system_name: "Fixture Log", time_zone: "America/Chicago",
  owner: { name: "Fixture Owner", email: "owner@example.com" },
  contributors: [{ name: "Fixture Helper", email: "helper@example.com", role: "contributor" }],
  logs: [{ id: "main", name: "Fixture Log", fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "notes", label: "Notes", type: "long_text", required: false },
  ] }],
  routing_rules: [],
  reminders: [
    { type: "follow_up_due", log: "main", date_field: "date", days_before: 2, notify: ["owner"], send_hour: 8 },
    { type: "weekly_digest", day: "MON", send_hour: 8, notify: ["owner"] },
  ],
  alerts: [{ on: "new_entry", when_entered_by: "contributor", notify: ["owner"] }],
};
const reply = (p, unsupported = []) => ({ plan: p, follow_up_questions: [], unsupported_requests: unsupported });
const rec = (id, extra) => ({
  _test_fixture: MARK, persona_id: id, produced_by: PRODUCED_BY, date: "2000-01-01", planner_prompt_version: "v1",
  raw_plan: reply(plan), validation: { first_try_pass: true, retried: false, retry_pass: null },
  notes: MARK, ...extra,
});
const write = (dir, name, obj) => writeFileSync(join(here, dir, name), JSON.stringify(obj, null, 2) + "\n");

for (const id of ["fx-first-try", "fx-retry", "fx-never-valid", "fx-bad-provenance", "fx-mismatch", "fx-norecord"]) write("personas", `${id}.json`, persona(id));
write("recordings", "fx-first-try.v1.json", rec("fx-first-try", { duration_ms: 1234, tokens: { input: 10, output: 20 } }));
const badPlan = { ...structuredClone(plan), extra_key: true };
write("recordings", "fx-retry.v1.json", rec("fx-retry", { raw_plan: reply(badPlan), validation: { first_try_pass: false, retried: true, retry_pass: true }, retry_plan: reply(plan) }));
write("recordings", "fx-never-valid.v1.json", rec("fx-never-valid", { raw_plan: reply(badPlan), validation: { first_try_pass: false, retried: true, retry_pass: false }, retry_plan: reply(badPlan) }));
write("recordings", "fx-bad-provenance.v1.json", rec("fx-bad-provenance", { produced_by: "paid API" }));
write("recordings", "fx-mismatch.v1.json", rec("fx-mismatch", { validation: { first_try_pass: false, retried: false, retry_pass: null } }));
