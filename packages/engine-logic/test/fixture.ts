import type { Plan, Entry } from "../src/index.js";

export function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    schema_version: 1,
    system_name: "Employer Outreach Log",
    time_zone: "America/Chicago",
    owner: { name: "Sample Owner", email: "owner@example.com" },
    contributors: [{ name: "Sample Rep", email: "Rep@Example.com", role: "contributor" }],
    logs: [
      {
        id: "main",
        name: "All Employers",
        fields: [
          { key: "org_name", label: "Organization", type: "text", required: true },
          { key: "contact_email", label: "Contact email", type: "email", required: false },
          { key: "interaction", label: "Interaction type", type: "choice", options: ["Email", "Call", "Meeting", "Event"], required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "area", label: "Area", type: "multi_choice", options: ["Education", "Psychology", "Arts"], required: true },
          { key: "follow_up", label: "Follow-up date", type: "date", required: false },
          { key: "notes", label: "Notes", type: "long_text", required: false },
        ],
      },
      { id: "education", name: "Education Log", copy_fields_from: "main" },
      { id: "arts", name: "Arts Log", copy_fields_from: "main" },
    ],
    routing_rules: [
      { from: "main", when: { field: "area", includes: "Education" }, copy_to: "education" },
      { from: "main", when: { field: "area", includes: "Arts" }, copy_to: "arts" },
      { from: "main", when: { field: "interaction", includes: "Event" }, copy_to: "arts" },
    ],
    reminders: [
      { type: "follow_up_due", log: "main", date_field: "follow_up", days_before: 1, notify: ["owner"], send_hour: 8 },
      { type: "weekly_digest", day: "MON", send_hour: 8, notify: ["owner"] },
    ],
    alerts: [{ on: "new_entry", when_entered_by: "contributor", notify: ["owner"] }],
    ...over,
  };
}

export function makeEntry(over: Partial<Entry> & { values?: Entry["values"] } = {}): Entry {
  return {
    id: "e1",
    enteredBy: "rep@example.com",
    values: { org_name: "Acme", interaction: "Email", date: "2026-03-01", area: ["Education"], follow_up: "", ...over.values },
    ...(over.id ? { id: over.id } : {}),
    ...(over.enteredBy ? { enteredBy: over.enteredBy } : {}),
    ...(over.enteredAt ? { enteredAt: over.enteredAt } : {}),
  };
}
