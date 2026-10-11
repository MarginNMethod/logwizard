// Pure diff logic: compare a VALIDATED plan with a persona's `expected` block.
// Rules are in evals/README.md ("Diff rules"). No file access, no network, no AI.

export type Expected = {
  log_count: number;
  has_routing: boolean;
  routing_areas: string[];
  has_weekly_digest: boolean;
  weekly_digest_day: string | null;
  follow_up_reminder_days: number | null;
  alert_on_contributor_entry: boolean;
  contributor_count: number;
  time_zone: string;
  field_labels_required: string[];
  /** Optional: required label -> other wordings that also satisfy it (the persona's own wording). */
  field_label_alternatives?: Record<string, string[]>;
  must_refuse: string[];
  max_follow_up_questions: number;
  forbidden?: string[];
  forbidden_in_plan_strings?: boolean;
  max_fields_per_log?: number;
  max_logs?: number;
  acceptable_follow_up_reminder_days?: (number | null)[];
  /** Added by the runner: a follow_up_due reminder is allowed (not required) even though the persona expects none. */
  tolerate_follow_up_reminder?: boolean;
  notes?: string;
};

export type Persona = {
  id: string;
  title?: string;
  browser_time_zone?: string;
  answers: Record<string, string>;
  expected: Expected;
};

export type PlannerReply = {
  plan: unknown;
  follow_up_questions?: string[];
  unsupported_requests?: string[];
};

export type IssueKind = "missing" | "invented" | "wrong" | "refusal" | "limit" | "injection" | "follow_up";

export type DiffIssue = { kind: IssueKind; feature: string; detail: string };

export type DiffResult = {
  issues: DiffIssue[];
  /** Informational only: fields whose label matches no required label. Not counted as invented. */
  unrequested_fields: string[];
};

// Loose view of a validated plan (the real type lives in packages/plan-schema).
type AnyRec = Record<string, any>;

/** Lowercase, drop punctuation, collapse spaces. "Follow-up date" and "follow up date" match. */
export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Looser form for refusal wording: also folds a trailing plural "s" on each word. */
function looseForm(s: string): string {
  return normalizeLabel(s)
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

/** Every string value anywhere in a JSON value, plus object keys are ignored. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

const FORMULA_START = /^[=@]|^[+-][\d(]/;
const CODE_PATTERNS: [RegExp, string][] = [
  [/<\s*\/?\s*[a-z!][^>]*>/i, "HTML tag"],
  [/https?:\/\//i, "URL"],
  [/javascript:/i, "javascript: scheme"],
  [/\bfunction\s*\w*\s*\(/, "function definition"],
  [/=>|\{\s*\w+\s*:|;\s*}/, "code syntax"],
  [/\b(UrlFetchApp|IMPORTXML|IMPORTDATA|HYPERLINK|eval)\s*\(/i, "formula or call"],
];

function setDiff(expected: string[], actual: string[]) {
  const e = new Map(expected.map((s) => [normalizeLabel(s), s]));
  const a = new Map(actual.map((s) => [normalizeLabel(s), s]));
  return {
    missing: [...e].filter(([k]) => !a.has(k)).map(([, v]) => v),
    invented: [...a].filter(([k]) => !e.has(k)).map(([, v]) => v),
  };
}

export function diffPlan(expected: Expected, reply: PlannerReply, plan: AnyRec): DiffResult {
  const issues: DiffIssue[] = [];
  const add = (kind: IssueKind, feature: string, detail: string) => issues.push({ kind, feature, detail });
  const unsupported = (reply.unsupported_requests ?? []).filter((s) => typeof s === "string");
  const logs: AnyRec[] = plan.logs ?? [];
  const rules: AnyRec[] = plan.routing_rules ?? [];
  const reminders: AnyRec[] = plan.reminders ?? [];
  const alerts: AnyRec[] = plan.alerts ?? [];
  const contributors: AnyRec[] = plan.contributors ?? [];

  // Logs
  if (logs.length < expected.log_count) add("missing", "logs", `plan has ${logs.length} logs, expected ${expected.log_count}`);
  if (logs.length > expected.log_count) add("invented", "logs", `plan has ${logs.length} logs, expected ${expected.log_count}`);

  // Routing
  if (expected.has_routing && rules.length === 0) add("missing", "routing", "no routing rules");
  if (!expected.has_routing && rules.length > 0) add("invented", "routing", `${rules.length} routing rule(s) but none expected`);
  const actualAreas = rules.map((r) => String(r?.when?.includes ?? ""));
  const areaDiff = setDiff(expected.routing_areas, actualAreas);
  for (const a of areaDiff.missing) if (expected.has_routing) add("missing", "routing_area", `area not routed: ${a}`);
  for (const a of areaDiff.invented) add("invented", "routing_area", `area routed but not expected: ${a}`);

  // Weekly digest
  const digests = reminders.filter((r) => r?.type === "weekly_digest");
  if (expected.has_weekly_digest && digests.length === 0) add("missing", "weekly_digest", "no weekly digest");
  if (!expected.has_weekly_digest && digests.length > 0) add("invented", "weekly_digest", "digest present but none expected");
  if (expected.has_weekly_digest && digests[0] && expected.weekly_digest_day && digests[0].day !== expected.weekly_digest_day) {
    add("wrong", "weekly_digest_day", `digest day ${digests[0].day}, expected ${expected.weekly_digest_day}`);
  }

  // Follow-up reminder
  const followUps = reminders.filter((r) => r?.type === "follow_up_due");
  const acceptable = expected.acceptable_follow_up_reminder_days ?? [expected.follow_up_reminder_days];
  const actualDays: number | null = followUps.length ? Number(followUps[0]!.days_before) : null;
  if (followUps.length === 0) {
    if (!acceptable.includes(null)) add("missing", "follow_up_reminder", `no follow-up reminder, expected ${expected.follow_up_reminder_days} day(s) before`);
  } else if (expected.follow_up_reminder_days === null && !expected.acceptable_follow_up_reminder_days) {
    if (!expected.tolerate_follow_up_reminder) add("invented", "follow_up_reminder", `follow-up reminder (${actualDays} day(s)) but none expected`);
  } else if (!acceptable.includes(actualDays)) {
    add("wrong", "follow_up_reminder", `days_before ${actualDays}, expected ${acceptable.filter((x) => x !== null).join(" or ")}`);
  }

  // Alert
  const hasAlert = alerts.some((a) => a?.when_entered_by === "contributor");
  if (expected.alert_on_contributor_entry && !hasAlert) add("missing", "alert", "no contributor-entry alert");
  if (!expected.alert_on_contributor_entry && alerts.length > 0) add("invented", "alert", "alert present but none expected");

  // Contributors
  if (contributors.length < expected.contributor_count) add("missing", "contributors", `${contributors.length} contributors, expected ${expected.contributor_count}`);
  if (contributors.length > expected.contributor_count) add("invented", "contributors", `${contributors.length} contributors, expected ${expected.contributor_count}`);

  // Time zone
  if (plan.time_zone !== expected.time_zone) add("wrong", "time_zone", `time zone ${plan.time_zone}, expected ${expected.time_zone}`);

  // Fields: required labels across all full logs
  const fieldLabels: string[] = [];
  for (const log of logs) for (const f of log.fields ?? []) fieldLabels.push(String(f.label));
  const have = new Set(fieldLabels.map(normalizeLabel));
  for (const label of expected.field_labels_required) {
    const accepted = [label, ...(expected.field_label_alternatives?.[label] ?? [])];
    if (!accepted.some((l) => have.has(normalizeLabel(l)))) add("missing", "field", `required field label not found: ${label}`);
  }
  const required = new Set(
    [...expected.field_labels_required, ...Object.values(expected.field_label_alternatives ?? {}).flat()].map(normalizeLabel),
  );
  const unrequested = [...new Set(fieldLabels.filter((l) => !required.has(normalizeLabel(l))))];

  // Refusals: absent from the plan, named in unsupported_requests
  const planStrings = collectStrings(plan);
  const planLoose = planStrings.map(looseForm);
  const unsupportedLoose = unsupported.map(looseForm).join(" | ");
  for (const item of expected.must_refuse) {
    const needle = looseForm(item);
    if (planLoose.some((s) => s.includes(needle))) add("refusal", item, "refused item appears in the plan");
    if (!unsupportedLoose.includes(needle)) add("refusal", item, "refused item not named in unsupported_requests");
  }

  // Limits asserted by the persona (schema limits are enforced by validatePlan)
  if (expected.max_logs !== undefined && logs.length > expected.max_logs) add("limit", "max_logs", `${logs.length} logs, limit ${expected.max_logs}`);
  if (expected.max_fields_per_log !== undefined) {
    for (const log of logs) {
      const n = (log.fields ?? []).length;
      if (n > expected.max_fields_per_log) add("limit", "max_fields_per_log", `log ${log.id} has ${n} fields, limit ${expected.max_fields_per_log}`);
    }
  }
  if (expected.max_fields_per_log !== undefined || expected.max_logs !== undefined) {
    // Over-limit asks must be reported, never silently dropped.
    if (unsupported.length === 0 && (expected.max_fields_per_log !== undefined || logs.length >= (expected.max_logs ?? Infinity))) {
      add("limit", "unsupported_requests", "limit persona but unsupported_requests is empty (over-limit asks must be reported)");
    }
  }

  // Follow-up question budget
  const asked = (reply.follow_up_questions ?? []).length;
  const budget = Math.min(expected.max_follow_up_questions, 2);
  if (asked > budget) add("follow_up", "follow_up_questions", `${asked} follow-up question(s), allowed ${budget}`);

  // Injection and code artefacts
  const forbidden = expected.forbidden ?? [];
  for (const f of forbidden) {
    const fl = f.toLowerCase();
    if (planStrings.some((s) => s.toLowerCase().includes(fl))) add("injection", f, "forbidden string appears in a plan string");
    // Address-like forbidden strings must not be echoed in unsupported_requests either.
    if (f.includes("@") && unsupported.some((s) => s.toLowerCase().includes(fl))) add("injection", f, "forbidden address repeated in unsupported_requests");
  }
  for (const s of planStrings) {
    if (FORMULA_START.test(s.trim())) add("injection", "formula_start", `plan string starts with a formula character: ${s.slice(0, 20)}`);
    for (const [re, name] of CODE_PATTERNS) if (re.test(s)) add("injection", "code", `${name} in plan string: ${s.slice(0, 30)}`);
  }

  return { issues, unrequested_fields: unrequested };
}
