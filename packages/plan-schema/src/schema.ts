import { z } from "zod";
import { FIELD_TYPES, LIMITS, WEEKDAYS } from "./limits.js";
import { emailText, keyText, safeText } from "./text.js";

// ---------- time zone ----------

/** True for real IANA names such as "America/Chicago" (exact capitalization) or "UTC". */
export function isValidTimeZone(tz: string): boolean {
  if (tz === "UTC") return true;
  // Needs a Region/City shape. Rejects offsets like "+01:00" and abbreviations like "CST".
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(tz)) return false;
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
    // Intl accepts any capitalization; the Apps Script engine does not, so require the proper one.
    return !(resolved.toLowerCase() === tz.toLowerCase() && resolved !== tz);
  } catch {
    return false;
  }
}

// ---------- people ----------

const SinglePerson = {
  name: safeText("Name"),
  email: emailText("Email"),
};

const OwnerSchema = z.object(SinglePerson).strict();

const ContributorSchema = z
  .object({ ...SinglePerson, role: z.literal("contributor", { errorMap: () => ({ message: 'Role must be "contributor"' }) }) })
  .strict();

// ---------- fields and logs ----------

const FieldSchema = z
  .object({
    key: keyText("Field key"),
    label: safeText("Field label"),
    type: z.enum(FIELD_TYPES, {
      errorMap: () => ({ message: `Field type must be one of: ${FIELD_TYPES.join(", ")}` }),
    }),
    required: z.boolean({ required_error: "required must be true or false", invalid_type_error: "required must be true or false" }),
    options: z.array(safeText("Option", LIMITS.maxOptionLength)).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const isChoice = f.type === "choice" || f.type === "multi_choice";
    if (isChoice) {
      const n = f.options?.length ?? 0;
      if (n < LIMITS.minOptions || n > LIMITS.maxOptions) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: `A ${f.type} field needs ${LIMITS.minOptions} to ${LIMITS.maxOptions} options, but this one has ${n}`,
        });
      }
      const seen = new Set<string>();
      f.options?.forEach((o, i) => {
        const k = o.toLowerCase();
        if (seen.has(k)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options", i], message: `Option "${o}" appears more than once in this field` });
        }
        seen.add(k);
      });
    } else if (f.options !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `Only choice and multi_choice fields can have options, but this field is type ${f.type}. Remove options`,
      });
    }
  });

/**
 * A log is either a "base" log (has its own fields) or a "copy" log
 * (copy_fields_from names a base log and it reuses that log's columns). Exactly one.
 */
const LogSchema = z
  .object({
    id: keyText("Log id"),
    name: safeText("Log name"),
    fields: z
      .array(FieldSchema)
      .min(1, "A log needs at least 1 field")
      .max(LIMITS.maxFieldsPerLog, `A log can have at most ${LIMITS.maxFieldsPerLog} fields`)
      .optional(),
    copy_fields_from: keyText("copy_fields_from").optional(),
  })
  .strict()
  .superRefine((log, ctx) => {
    const hasFields = log.fields !== undefined;
    const hasCopy = log.copy_fields_from !== undefined;
    if (hasFields === hasCopy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Log "${log.id}" must have either "fields" (its own columns) or "copy_fields_from" (reuse another log's columns), not both and not neither`,
      });
    }
    const seen = new Set<string>();
    log.fields?.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", i, "key"], message: `Field key "${f.key}" is used twice in log "${log.id}". Keys must be unique within a log` });
      }
      seen.add(f.key);
    });
  });

// ---------- routing, reminders, alerts ----------

const RoutingRuleSchema = z
  .object({
    from: keyText("Routing rule from"),
    when: z.object({ field: keyText("Routing field"), includes: safeText("Routing includes value", LIMITS.maxOptionLength) }).strict(),
    copy_to: keyText("Routing rule copy_to"),
  })
  .strict();

const Notify = z
  .array(safeText("Notify target", LIMITS.maxEmailLength))
  .min(1, 'notify must list at least one target: "owner", "contributors", or an email address from the plan')
  .max(LIMITS.maxNotifyTargets, `notify can list at most ${LIMITS.maxNotifyTargets} targets`);

const SendHour = z
  .number({ required_error: "send_hour is required", invalid_type_error: "send_hour must be a whole number from 0 to 23" })
  .int("send_hour must be a whole number from 0 to 23")
  .min(0, "send_hour must be from 0 to 23")
  .max(23, "send_hour must be from 0 to 23");

const FollowUpReminder = z
  .object({
    type: z.literal("follow_up_due"),
    log: keyText("Reminder log"),
    date_field: keyText("Reminder date_field"),
    days_before: z
      .number({ required_error: "days_before is required", invalid_type_error: "days_before must be a whole number" })
      .int("days_before must be a whole number")
      .min(0, `days_before must be from 0 to ${LIMITS.maxDaysBefore}`)
      .max(LIMITS.maxDaysBefore, `days_before must be from 0 to ${LIMITS.maxDaysBefore}`),
    notify: Notify,
    send_hour: SendHour,
  })
  .strict();

const WeeklyDigestReminder = z
  .object({
    type: z.literal("weekly_digest"),
    day: z.enum(WEEKDAYS, { errorMap: () => ({ message: `day must be one of: ${WEEKDAYS.join(", ")}` }) }),
    notify: Notify,
    send_hour: SendHour,
  })
  .strict();

const ReminderSchema = z.discriminatedUnion(
  "type",
  [FollowUpReminder, WeeklyDigestReminder],
  { errorMap: () => ({ message: 'Reminder type must be "follow_up_due" or "weekly_digest"' }) },
);

const AlertSchema = z
  .object({
    on: z.literal("new_entry", { errorMap: () => ({ message: 'Alert "on" must be "new_entry"' }) }),
    when_entered_by: z.literal("contributor", { errorMap: () => ({ message: 'Alert "when_entered_by" must be "contributor"' }) }),
    notify: Notify,
  })
  .strict();

// ---------- the plan ----------

const PlanObject = z
  .object({
    schema_version: z.literal(1, { errorMap: () => ({ message: "schema_version must be 1" }) }),
    system_name: safeText("System name"),
    time_zone: z
      .string({ required_error: "time_zone is required", invalid_type_error: "time_zone must be text" })
      .trim()
      .refine(isValidTimeZone, (v) => ({
        message: `time_zone "${v}" is not a valid IANA time zone name. Use a name like "America/Chicago" or "Europe/London" with exact capitalization`,
      })),
    owner: OwnerSchema,
    contributors: z.array(ContributorSchema).max(LIMITS.maxContributors, `A plan can have at most ${LIMITS.maxContributors} contributors`).default([]),
    logs: z
      .array(LogSchema)
      .min(1, "A plan needs at least 1 log")
      .max(LIMITS.maxLogs, `A plan can have at most ${LIMITS.maxLogs} logs`),
    routing_rules: z.array(RoutingRuleSchema).max(LIMITS.maxRoutingRules, `A plan can have at most ${LIMITS.maxRoutingRules} routing rules`).default([]),
    reminders: z.array(ReminderSchema).max(LIMITS.maxReminders, `A plan can have at most ${LIMITS.maxReminders} reminders`).default([]),
    alerts: z.array(AlertSchema).max(LIMITS.maxAlerts, `A plan can have at most ${LIMITS.maxAlerts} alerts`).default([]),
  })
  .strict();

export const PlanSchema = PlanObject.superRefine(crossChecks);

export type Plan = z.infer<typeof PlanObject>;
export type PlanLog = Plan["logs"][number];
export type PlanField = NonNullable<PlanLog["fields"]>[number];

// ---------- rules that look across the whole plan ----------

function crossChecks(plan: Plan, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  const logs = new Map<string, PlanLog>();
  const names = new Set<string>();
  plan.logs.forEach((log, i) => {
    if (logs.has(log.id)) issue(["logs", i, "id"], `Log id "${log.id}" is used twice. Log ids must be unique`);
    logs.set(log.id, log);
    const n = log.name.toLowerCase();
    if (names.has(n)) issue(["logs", i, "name"], `Log name "${log.name}" is used twice. Log names must be unique (they become sheet tab names)`);
    names.add(n);
  });

  // copy_fields_from: must exist, not self, not a chain.
  plan.logs.forEach((log, i) => {
    const src = log.copy_fields_from;
    if (src === undefined) return;
    const path = ["logs", i, "copy_fields_from"];
    if (src === log.id) return issue(path, `Log "${log.id}" cannot copy fields from itself`);
    const srcLog = logs.get(src);
    if (!srcLog) return issue(path, `copy_fields_from "${src}" does not match any log id`);
    if (srcLog.copy_fields_from !== undefined) {
      issue(path, `Log "${log.id}" copies fields from "${src}", but "${src}" itself copies fields from another log. Chains are not allowed: point to a log that has its own fields`);
    }
  });

  // routing rules
  plan.routing_rules.forEach((rule, i) => {
    const at = (k: string) => ["routing_rules", i, k];
    const from = logs.get(rule.from);
    const to = logs.get(rule.copy_to);
    if (!from) issue(at("from"), `Routing rule "from" "${rule.from}" does not match any log id`);
    if (!to) issue(at("copy_to"), `Routing rule "copy_to" "${rule.copy_to}" does not match any log id`);
    if (rule.from === rule.copy_to) issue(at("copy_to"), `Routing rule cannot send log "${rule.from}" to itself`);
    if (!from || !to || rule.from === rule.copy_to) return;

    if (to.copy_fields_from !== rule.from) {
      issue(at("copy_to"), `Target log "${to.id}" must have copy_fields_from set to "${from.id}" so the copied rows fit its columns`);
    }
    if (!from.fields) {
      issue(at("from"), `Log "${from.id}" has no fields of its own, so it cannot be a routing source. Route from the log it copies fields from`);
      return;
    }
    const field = from.fields.find((f) => f.key === rule.when.field);
    if (!field) {
      issue(["routing_rules", i, "when", "field"], `Field "${rule.when.field}" does not exist in log "${from.id}"`);
    } else if (field.type !== "choice" && field.type !== "multi_choice") {
      issue(["routing_rules", i, "when", "field"], `Field "${field.key}" is type ${field.type}. Routing can only use choice or multi_choice fields`);
    } else if (!(field.options ?? []).includes(rule.when.includes)) {
      issue(["routing_rules", i, "when", "includes"], `"${rule.when.includes}" is not one of the options of field "${field.key}" (options: ${(field.options ?? []).join(", ")})`);
    }
  });

  // reminders
  plan.reminders.forEach((rem, i) => {
    if (rem.type !== "follow_up_due") return;
    const log = logs.get(rem.log);
    if (!log) return issue(["reminders", i, "log"], `Reminder log "${rem.log}" does not match any log id`);
    // A copy log has the same columns as the log it copies.
    const fields = log.fields ?? (log.copy_fields_from ? logs.get(log.copy_fields_from)?.fields : undefined) ?? [];
    const field = fields.find((f) => f.key === rem.date_field);
    if (!field) issue(["reminders", i, "date_field"], `date_field "${rem.date_field}" does not exist in log "${log.id}"`);
    else if (field.type !== "date") issue(["reminders", i, "date_field"], `date_field "${field.key}" is type ${field.type}, but it must be a date field`);
  });

  // contributors
  const emails = new Set<string>([plan.owner.email.toLowerCase()]);
  const seenContrib = new Set<string>();
  plan.contributors.forEach((c, i) => {
    const e = c.email.toLowerCase();
    if (seenContrib.has(e)) issue(["contributors", i, "email"], `Contributor email "${c.email}" is listed twice`);
    seenContrib.add(e);
    emails.add(e);
  });

  // notify targets (reminders and alerts)
  const checkNotify = (list: string[], base: (string | number)[]) =>
    list.forEach((t, j) => {
      const path = [...base, "notify", j];
      if (t === "owner") return;
      if (t === "contributors") {
        if (plan.contributors.length === 0) issue(path, 'notify includes "contributors" but the plan has no contributors');
        return;
      }
      if (!t.includes("@")) return issue(path, `notify target "${t}" must be "owner", "contributors", or an email address listed in the plan`);
      if (!emails.has(t.toLowerCase())) issue(path, `notify email "${t}" is not the owner or a contributor in this plan. Add the person to contributors first`);
    });
  plan.reminders.forEach((r, i) => checkNotify(r.notify, ["reminders", i]));
  plan.alerts.forEach((a, i) => checkNotify(a.notify, ["alerts", i]));
}
