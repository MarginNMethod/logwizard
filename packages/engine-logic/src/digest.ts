import type { Plan, RowsByLog } from "./types.js";
import { logFields, resolveNotify } from "./types.js";
import { addDays, isIsoDate, zonedParts } from "./time.js";

type DigestReminder = Extract<Plan["reminders"][number], { type: "weekly_digest" }>;

/** Weekly digest reminders whose day matches today and whose send_hour has been reached (plan time zone). */
export function dueDigests(plan: Plan, now: Date): DigestReminder[] {
  const local = zonedParts(now, plan.time_zone);
  return plan.reminders.filter(
    (r): r is DigestReminder => r.type === "weekly_digest" && r.day === local.day && local.hour >= r.send_hour,
  );
}

/** True when any weekly digest should go out now. The caller records a sent key so it fires once per day. */
export function isDigestDue(plan: Plan, now: Date): boolean {
  return dueDigests(plan, now).length > 0;
}

export interface DigestRow {
  entryId: string;
  title: string;
  date?: string;
}

export interface DigestLog {
  logId: string;
  logName: string;
  /** Entries added in the 7 days up to now (needs Entry.enteredAt). */
  newEntries: DigestRow[];
  /** Follow-ups dated today through the next 7 days, soonest first. */
  upcoming: DigestRow[];
  /** Follow-ups dated before today. */
  overdue: DigestRow[];
}

export interface Digest {
  systemName: string;
  /** Local date the digest was built for. */
  localDate: string;
  logs: DigestLog[];
  totals: { newEntries: number; upcoming: number; overdue: number };
}

/**
 * Digest content grouped by log. Follow-up dates come from the date fields named
 * by the plan's follow_up_due reminders for that log. Logs with nothing to
 * report are omitted.
 */
export function buildDigest(plan: Plan, rowsByLog: RowsByLog, now: Date): Digest {
  const today = zonedParts(now, plan.time_zone).date;
  const weekAgoMs = now.getTime() - 7 * 86400000;
  const horizon = addDays(today, 7);
  const logs: DigestLog[] = [];

  for (const log of plan.logs) {
    const fields = logFields(plan, log.id);
    const titleKey = fields[0]?.key;
    const dateKeys = plan.reminders.flatMap((r) => (r.type === "follow_up_due" && r.log === log.id ? [r.date_field] : []));
    const newEntries: DigestRow[] = [];
    const upcoming: DigestRow[] = [];
    const overdue: DigestRow[] = [];

    for (const row of rowsByLog[log.id] ?? []) {
      const tv = titleKey ? row.values[titleKey] : undefined;
      const title = Array.isArray(tv) ? tv.join(", ") : tv === undefined || tv === "" ? row.id : String(tv);
      const at = row.enteredAt ? Date.parse(row.enteredAt) : NaN;
      if (Number.isFinite(at) && at > weekAgoMs && at <= now.getTime()) newEntries.push({ entryId: row.id, title });
      for (const k of new Set(dateKeys)) {
        const d = row.values[k];
        if (typeof d !== "string" || !isIsoDate(d)) continue;
        if (d < today) overdue.push({ entryId: row.id, title, date: d });
        else if (d <= horizon) upcoming.push({ entryId: row.id, title, date: d });
      }
    }
    const byDate = (a: DigestRow, b: DigestRow) => (a.date ?? "").localeCompare(b.date ?? "");
    upcoming.sort(byDate);
    overdue.sort(byDate);
    if (newEntries.length || upcoming.length || overdue.length) {
      logs.push({ logId: log.id, logName: log.name, newEntries, upcoming, overdue });
    }
  }

  const sum = (f: (l: DigestLog) => number) => logs.reduce((n, l) => n + f(l), 0);
  return {
    systemName: plan.system_name,
    localDate: today,
    logs,
    totals: { newEntries: sum((l) => l.newEntries.length), upcoming: sum((l) => l.upcoming.length), overdue: sum((l) => l.overdue.length) },
  };
}

export interface DigestEmail {
  to: string;
  digest: Digest;
  key: string;
}

/** Digests to send now, one per recipient per day. Pass back sent keys to stay idempotent. */
export function digestsToSend(plan: Plan, rowsByLog: RowsByLog, now: Date, sentKeys?: ReadonlySet<string>): DigestEmail[] {
  const due = dueDigests(plan, now);
  if (due.length === 0) return [];
  const digest = buildDigest(plan, rowsByLog, now);
  const seen = new Set<string>();
  const out: DigestEmail[] = [];
  for (const r of due) {
    for (const to of resolveNotify(plan, r.notify)) {
      const key = `digest|${digest.localDate}|${to}`;
      if (seen.has(to) || sentKeys?.has(key)) continue;
      seen.add(to);
      out.push({ to, digest, key });
    }
  }
  return out;
}
