import type { Plan, PlanLog } from "./schema.js";
import { zoneDisplayName } from "./timezones.js";

const DAY_NAMES: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function hourWords(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${suffix}`;
}

/** "Central Time (America/Chicago)". Uses a pinned name table so the text is the same on every runtime. */
function zoneWords(tz: string): string {
  const name = zoneDisplayName(tz);
  return name ? `${name} (${tz})` : tz;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Plain-English preview of a validated plan. Pure and deterministic: no AI, no clock, no network. */
export function plainEnglishSummary(plan: Plan): string {
  const logsById = new Map(plan.logs.map((l) => [l.id, l]));
  const fieldsOf = (log: PlanLog) => log.fields ?? logsById.get(log.copy_fields_from ?? "")?.fields ?? [];
  const labelOf = (log: PlanLog, key: string) => fieldsOf(log).find((f) => f.key === key)?.label ?? key;

  const who = (targets: string[]): string =>
    list(
      targets.map((t) => {
        if (t === "owner") return `the owner (${plan.owner.email})`;
        if (t === "contributors") return `all contributors (${plural(plan.contributors.length, "person", "people")})`;
        return t;
      }),
    );

  const lines: string[] = [];
  lines.push(`Your system "${plan.system_name}" will use the time zone ${zoneWords(plan.time_zone)}.`);
  lines.push(`I will create ${plural(plan.logs.length, "log")}:`);
  for (const log of plan.logs) {
    if (log.fields) lines.push(`- "${log.name}" with ${plural(log.fields.length, "field")}: ${list(log.fields.map((f) => f.label))}.`);
    else lines.push(`- "${log.name}" with the same fields as "${logsById.get(log.copy_fields_from ?? "")?.name ?? log.copy_fields_from}".`);
  }

  if (plan.contributors.length > 0) {
    lines.push(`People who can add entries: ${list(plan.contributors.map((c) => `${c.name} (${c.email})`))}.`);
  }

  if (plan.routing_rules.length > 0) {
    lines.push("Copying entries between logs:");
    for (const r of plan.routing_rules) {
      const from = logsById.get(r.from);
      const to = logsById.get(r.copy_to);
      lines.push(`- When an entry in "${from?.name ?? r.from}" has ${from ? labelOf(from, r.when.field) : r.when.field} including "${r.when.includes}", I will also copy it to "${to?.name ?? r.copy_to}". The copy is a snapshot: later edits to the original are not copied.`);
    }
  }

  if (plan.reminders.length > 0) {
    lines.push("Reminders:");
    for (const r of plan.reminders) {
      const at = `${hourWords(r.send_hour)} ${zoneWords(plan.time_zone)}`;
      if (r.type === "weekly_digest") {
        lines.push(`- Every ${DAY_NAMES[r.day]} at ${at}, I will email ${who(r.notify)} a weekly digest.`);
      } else {
        const log = logsById.get(r.log);
        const when = r.days_before === 0 ? "On the day" : `${plural(r.days_before, "day")} before`;
        lines.push(`- ${when} each "${log ? labelOf(log, r.date_field) : r.date_field}" date in "${log?.name ?? r.log}", at ${at}, I will email ${who(r.notify)} about follow-ups that are due.`);
      }
    }
  }

  if (plan.alerts.length > 0) {
    lines.push("Alerts:");
    for (const a of plan.alerts) {
      lines.push(`- When a contributor adds a new entry, I will email ${who(a.notify)}.`);
    }
  }

  return lines.join("\n");
}
