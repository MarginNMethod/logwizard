// Hard limits from PLAN.md section 4. One place so the schema, the prompt
// text, and the tests all agree.
export const LIMITS = {
  maxLogs: 6,
  maxFieldsPerLog: 25,
  maxRoutingRules: 20,
  maxReminders: 10,
  maxAlerts: 5,
  maxContributors: 20,
  maxNotifyTargets: 10,
  minOptions: 1,
  maxOptions: 30,
  maxNameLength: 80, // system name, log names, person names, field labels
  maxOptionLength: 60,
  maxKeyLength: 40, // log ids and field keys
  maxEmailLength: 254,
  maxDaysBefore: 30,
} as const;

export const FIELD_TYPES = [
  "text",
  "long_text",
  "email",
  "phone",
  "date",
  "number",
  "choice",
  "multi_choice",
  "yes_no",
  "url",
] as const;

export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
