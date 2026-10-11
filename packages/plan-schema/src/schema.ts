import { z } from "zod";
import { FIELD_TYPES, LIMITS, WEEKDAYS } from "./limits.js";
import { emailText, keyText, safeText, show } from "./text.js";
import { TIME_ZONES } from "./timezones.js";

// ---------- time zone ----------

/** True for names on the pinned allowlist: "America/Chicago" (exact capitalization) or "UTC". */
export function isValidTimeZone(tz: string): boolean {
  return TIME_ZONES.has(tz);
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
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options", i], message: `Option "${show(o)}" appears more than once in this field` });
        }
        seen.add(k);
        if (o.includes(",")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["options", i],
            message: `Option "${show(o)}" contains a comma. Options cannot contain commas because several answers are joined with commas. Remove the comma or reword it`,
          });
        }
      });
    } else if (f.options !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `Only choice and multi_choice fields can have options, but this field is type ${f.type}. Remove options`,
      });
    }
  });

const RESERVED_LOG_NAMES = new Set(["_plan", "setup", "activity", "entries", "form responses 1"]);

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
        message: `Log "${show(log.id)}" must have either "fields" (its own columns) or "copy_fields_from" (reuse another log's columns), not both and not neither`,
      });
    }
    if (log.name.length <= LIMITS.maxNameLength && (RESERVED_LOG_NAMES.has(log.name.toLowerCase()) || log.name.startsWith("_"))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: `Log name "${show(log.name)}" is used by the system. Names that start with an underscore, and the names _plan, Setup, Activity, Entries, and Form Responses 1, cannot be used for a log. Choose another name`,
      });
    }
    const seen = new Set<string>();
    const labels = new Set<string>();
    log.fields?.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", i, "key"], message: `Field key "${show(f.key)}" is used twice in log "${show(log.id)}". Keys must be unique within a log` });
      }
      seen.add(f.key);
      const l = f.label.toLowerCase();
      if (labels.has(l)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", i, "label"], message: `Field label "${show(f.label)}" is used more than once in log "${show(log.id)}". Labels must be unique within a log, ignoring capitals` });
      }
      labels.add(l);
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
      .max(64, "time_zone must be at most 64 characters")
      .refine(isValidTimeZone, (v) => ({
        message: `time_zone "${show(v)}" is not a valid IANA time zone name. Use a name like "America/Chicago" or "Europe/London" with exact capitalization`,
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

/** Object-level schema only. validatePlan runs the cross checks separately, and only after this passes. */
export const PlanObjectSchema = PlanObject;
export const PlanSchema = PlanObject.superRefine(crossChecks);

export type Plan = z.infer<typeof PlanObject>;
export type PlanLog = Plan["logs"][number];
export type PlanField = NonNullable<PlanLog["fields"]>[number];

// ---------- rules that look across the whole plan ----------

export function crossChecks(plan: Plan, ctx: { addIssue: (i: z.IssueData) => void }): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  const logs = new Map<string, PlanLog>();
  const names = new Set<string>();
  plan.logs.forEach((log, i) => {
    if (logs.has(log.id)) issue(["logs", i, "id"], `Log id "${show(log.id)}" is used twice. Log ids must be unique`);
    logs.set(log.id, log);
    const n = log.name.toLowerCase();
    if (names.has(n)) issue(["logs", i, "name"], `Log name "${show(log.name)}" is used twice. Log names must be unique (they become sheet tab names)`);
    names.add(n);
  });

  // copy_fields_from: must exist, not self, not a chain.
  plan.logs.forEach((log, i) => {
    const src = log.copy_fields_from;
    if (src === undefined) return;
    const path = ["logs", i, "copy_fields_from"];
    if (src === log.id) return issue(path, `Log "${show(log.id)}" cannot copy fields from itself`);
    const srcLog = logs.get(src);
    if (!srcLog) return issue(path, `copy_fields_from "${show(src)}" does not match any log id`);
    if (srcLog.copy_fields_from !== undefined) {
      issue(path, `Log "${show(log.id)}" copies fields from "${show(src)}", but "${show(src)}" itself copies fields from another log. Chains are not allowed: point to a log that has its own fields`);
    }
  });

  // routing rules
  plan.routing_rules.forEach((rule, i) => {
    const at = (k: string) => ["routing_rules", i, k];
    const from = logs.get(rule.from);
    const to = logs.get(rule.copy_to);
    if (!from) issue(at("from"), `Routing rule "from" "${show(rule.from)}" does not match any log id`);
    if (!to) issue(at("copy_to"), `Routing rule "copy_to" "${show(rule.copy_to)}" does not match any log id`);
    if (rule.from === rule.copy_to) issue(at("copy_to"), `Routing rule cannot send log "${show(rule.from)}" to itself`);
    if (!from || !to || rule.from === rule.copy_to) return;

    if (to.copy_fields_from !== rule.from) {
      issue(at("copy_to"), `Target log "${show(to.id)}" must have copy_fields_from set to "${show(from.id)}" so the copied rows fit its columns`);
    }
    if (!from.fields) {
      issue(at("from"), `Log "${show(from.id)}" has no fields of its own, so it cannot be a routing source. Route from the log it copies fields from`);
      return;
    }
    const field = from.fields.find((f) => f.key === rule.when.field);
    if (!field) {
      issue(["routing_rules", i, "when", "field"], `Field "${show(rule.when.field)}" does not exist in log "${show(from.id)}"`);
    } else if (field.type !== "choice" && field.type !== "multi_choice") {
      issue(["routing_rules", i, "when", "field"], `Field "${show(field.key)}" is type ${field.type}. Routing can only use choice or multi_choice fields`);
    } else if (!(field.options ?? []).includes(rule.when.includes)) {
      issue(["routing_rules", i, "when", "includes"], `"${show(rule.when.includes)}" is not one of the options of field "${show(field.key)}" (the field has ${field.options?.length ?? 0} options)`);
    }
  });

  // reminders
  plan.reminders.forEach((rem, i) => {
    if (rem.type !== "follow_up_due") return;
    const log = logs.get(rem.log);
    if (!log) return issue(["reminders", i, "log"], `Reminder log "${show(rem.log)}" does not match any log id`);
    // A copy log has the same columns as the log it copies.
    const fields = log.fields ?? (log.copy_fields_from ? logs.get(log.copy_fields_from)?.fields : undefined) ?? [];
    const field = fields.find((f) => f.key === rem.date_field);
    if (!field) issue(["reminders", i, "date_field"], `date_field "${show(rem.date_field)}" does not exist in log "${show(log.id)}"`);
    else if (field.type !== "date") issue(["reminders", i, "date_field"], `date_field "${show(field.key)}" is type ${field.type}, but it must be a date field`);
  });

  // duplicate routing rules
  const seenRules = new Map<string, number>();
  plan.routing_rules.forEach((r, i) => {
    const key = JSON.stringify([r.from, r.when.field, r.when.includes.toLowerCase(), r.copy_to]);
    const first = seenRules.get(key);
    if (first !== undefined) issue(["routing_rules", i], `This routing rule is a duplicate of routing_rules[${first}]. Remove one of them`);
    else seenRules.set(key, i);
  });

  // reminders: at most one weekly digest
  let digestSeen = false;
  plan.reminders.forEach((r, i) => {
    if (r.type !== "weekly_digest") return;
    if (digestSeen) issue(["reminders", i], "A plan can have only one weekly_digest reminder");
    digestSeen = true;
  });

  // alerts need someone who can trigger them
  if (plan.contributors.length === 0) {
    plan.alerts.forEach((_, i) => issue(["alerts", i], "An alert needs at least one contributor, because it fires when a contributor adds an entry. Add a contributor or remove the alert"));
  }

  // contributors
  const ownerEmail = plan.owner.email.toLowerCase();
  const emails = new Set<string>([ownerEmail]);
  const seenContrib = new Set<string>();
  plan.contributors.forEach((c, i) => {
    const e = c.email.toLowerCase();
    if (e === ownerEmail) issue(["contributors", i, "email"], `Contributor email "${show(c.email)}" is the owner's email. The owner is already in the plan; remove this contributor`);
    else if (seenContrib.has(e)) issue(["contributors", i, "email"], `Contributor email "${show(c.email)}" is listed twice`);
    seenContrib.add(e);
    emails.add(e);
  });

  // notify targets (reminders and alerts)
  const checkNotify = (list: string[], base: (string | number)[]) => {
    const seenTargets = new Set<string>();
    list.forEach((t, j) => {
      const path = [...base, "notify", j];
      const tk = t.toLowerCase();
      if (seenTargets.has(tk)) issue(path, `notify lists "${show(t)}" more than once`);
      seenTargets.add(tk);
      if (t === "owner") return;
      if (t === "contributors") {
        if (plan.contributors.length === 0) issue(path, 'notify includes "contributors" but the plan has no contributors');
        return;
      }
      if (!t.includes("@")) return issue(path, `notify target "${show(t)}" must be "owner", "contributors", or an email address listed in the plan`);
      if (!emails.has(t.toLowerCase())) issue(path, `notify email "${show(t)}" is not the owner or a contributor in this plan. Add the person to contributors first`);
    });
  };
  plan.reminders.forEach((r, i) => checkNotify(r.notify, ["reminders", i]));
  plan.alerts.forEach((a, i) => checkNotify(a.notify, ["alerts", i]));
}
