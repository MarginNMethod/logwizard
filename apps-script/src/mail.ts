import type { Digest, Entry, Plan, ReminderEmail } from "@logwizard/engine-logic";
import { logFields } from "@logwizard/engine-logic";

export interface Outgoing {
  to: string;
  subject: string;
  body: string;
  /** Sent keys to record once this email goes out. */
  keys: string[];
}

export function reminderText(r: ReminderEmail): string {
  const lines = r.items.map((i) => `- ${i.title} (${i.logName}): follow up on ${i.dueDate}`);
  return `Follow-ups due:\n${lines.join("\n")}`;
}

export function digestText(d: Digest): string {
  if (d.logs.length === 0) return "Weekly digest: nothing new, upcoming, or overdue.";
  const out = [`Weekly digest (${d.totals.newEntries} new, ${d.totals.upcoming} upcoming, ${d.totals.overdue} overdue):`];
  for (const log of d.logs) {
    out.push("", log.logName);
    for (const r of log.newEntries) out.push(`  New: ${r.title}`);
    for (const r of log.upcoming) out.push(`  Upcoming: ${r.title} on ${r.date}`);
    for (const r of log.overdue) out.push(`  Overdue: ${r.title} was due ${r.date}`);
  }
  return out.join("\n");
}

/** One email per person: all reminders and any digest for that person are merged. */
export function buildOutgoing(
  plan: Plan,
  reminders: ReminderEmail[],
  digests: { to: string; digest: Digest; key: string }[],
  localDate: string,
): Outgoing[] {
  const byTo = new Map<string, { parts: string[]; keys: string[] }>();
  const slot = (to: string) => {
    let s = byTo.get(to);
    if (!s) byTo.set(to, (s = { parts: [], keys: [] }));
    return s;
  };
  for (const r of reminders) {
    const s = slot(r.to);
    s.parts.push(reminderText(r));
    s.keys.push(r.key);
  }
  for (const d of digests) {
    const s = slot(d.to);
    s.parts.push(digestText(d.digest));
    s.keys.push(d.key);
  }
  return [...byTo].map(([to, s]) => ({
    to,
    subject: `${plan.system_name}: your summary for ${localDate}`,
    body: `${s.parts.join("\n\n")}\n\nSent automatically by ${plan.system_name}.`,
    keys: s.keys,
  }));
}

export function alertEmail(plan: Plan, to: string, logId: string, logName: string, entry: Entry, who: string): Outgoing {
  const lines = logFields(plan, logId).map((f) => {
    const v = entry.values[f.key];
    const text = Array.isArray(v) ? v.join(", ") : v === undefined ? "" : String(v);
    return `${f.label}: ${text}`;
  });
  return {
    to,
    // The name can be typed by a contributor, so it stays out of the subject and is quoted in the body.
    subject: `${plan.system_name}: new entry in ${logName}`,
    body: `A new entry was added to "${logName}". Entered by: "${who}".\n\n${lines.join("\n")}\n\nSent automatically by ${plan.system_name}.`,
    keys: [],
  };
}

export function testEmail(plan: Plan, to: string, reminders: ReminderEmail[], digest: Digest, localDate: string): Outgoing {
  const parts = [`This is a test message from ${plan.system_name}. It was sent because you chose "Send test reminder". Nothing was recorded as sent, so the normal reminders still go out on schedule.`];
  if (reminders.length === 0) parts.push("No follow-ups are due today. Email sending works.");
  for (const r of reminders) parts.push(`Would go to ${r.to}:\n${reminderText(r)}`);
  parts.push(digestText(digest));
  return { to, subject: `[Test] ${plan.system_name}: reminder check for ${localDate}`, body: parts.join("\n\n"), keys: [] };
}
