import type { Plan, RowsByLog, Entry } from "./types.js";
import { findLog, logFields, resolveNotify } from "./types.js";
import { addDays, isIsoDate, zonedParts } from "./time.js";

export interface ReminderItem {
  logId: string;
  logName: string;
  entryId: string;
  /** First field of the log, as a human label for the row (for example the organization). */
  title: string;
  /** The follow-up date the row holds. */
  dueDate: string;
  daysBefore: number;
}

export interface ReminderEmail {
  to: string;
  /** Local date the email is for. */
  localDate: string;
  items: ReminderItem[];
  /** Persist this once sent and pass it back in `sentKeys` so a re-run (or the repeated 1am hour on a fall back day) sends nothing. */
  key: string;
}

export interface DueOptions {
  /** Keys of emails already sent. */
  sentKeys?: ReadonlySet<string>;
  /** Skip the send_hour check (used by "Send test reminder"). */
  ignoreSendHour?: boolean;
}

/**
 * Follow-up reminders due at `now`, one email per recipient per local day.
 *
 * A reminder is due when the row's date minus days_before equals today's date
 * in the plan time zone, and the local hour is at or past send_hour. "At or
 * past" (not "equal") means a trigger that fires late, or send_hour 2 on a
 * spring-forward day where 2am does not exist, still sends once that day.
 * Dates are compared as calendar dates, so DST cannot shift them.
 * Rows for a copy log are read with the fields of the log they copy.
 */
export function dueReminders(plan: Plan, rowsByLog: RowsByLog, now: Date, opts: DueOptions = {}): ReminderEmail[] {
  const local = zonedParts(now, plan.time_zone);
  const byRecipient = new Map<string, ReminderItem[]>();

  for (const rem of plan.reminders) {
    if (rem.type !== "follow_up_due") continue;
    if (!opts.ignoreSendHour && local.hour < rem.send_hour) continue;
    const log = findLog(plan, rem.log);
    if (!log) continue;
    const dateField = logFields(plan, rem.log).find((f) => f.key === rem.date_field && f.type === "date");
    if (!dateField) continue;
    const titleKey = logFields(plan, rem.log)[0]?.key;
    const recipients = resolveNotify(plan, rem.notify);

    for (const row of rowsByLog[rem.log] ?? []) {
      const due = row.values[rem.date_field];
      if (typeof due !== "string" || !isIsoDate(due)) continue;
      if (addDays(due, -rem.days_before) !== local.date) continue;
      const item = toItem(log.id, log.name, row, titleKey, due, rem.days_before);
      for (const to of recipients) {
        const list = byRecipient.get(to) ?? [];
        // Two reminders can match the same row; list it once per person.
        if (!list.some((i) => i.logId === item.logId && i.entryId === item.entryId && i.dueDate === item.dueDate)) list.push(item);
        byRecipient.set(to, list);
      }
    }
  }

  const out: ReminderEmail[] = [];
  for (const [to, items] of byRecipient) {
    const key = `followup|${local.date}|${to}`;
    if (opts.sentKeys?.has(key)) continue;
    out.push({ to, localDate: local.date, items, key });
  }
  return out;
}

function toItem(logId: string, logName: string, row: Entry, titleKey: string | undefined, dueDate: string, daysBefore: number): ReminderItem {
  const t = titleKey ? row.values[titleKey] : undefined;
  return {
    logId,
    logName,
    entryId: row.id,
    title: Array.isArray(t) ? t.join(", ") : t === undefined || t === "" ? row.id : String(t),
    dueDate,
    daysBefore,
  };
}
