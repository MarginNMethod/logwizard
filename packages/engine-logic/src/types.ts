import type { Plan, PlanField, PlanLog } from "@logwizard/plan-schema";

export type { Plan, PlanField, PlanLog };

/** A normalised cell value: text for most types, string[] for multi_choice, number for number. */
export type EntryValue = string | number | string[];

/**
 * One entry, or one row read back from a log tab. `values` is keyed by field key.
 * Dates are "YYYY-MM-DD" strings (the engine converts Sheets Date objects before calling in).
 */
export interface Entry {
  id: string;
  values: Record<string, EntryValue>;
  /** Email (or name fallback) of whoever entered it. */
  enteredBy: string;
  /** ISO instant, e.g. "2026-03-01T14:00:00Z". Optional; the digest uses it. */
  enteredAt?: string;
}

export type RowsByLog = Record<string, readonly Entry[]>;

/** Fields of a log. A copy log has the same columns as the log it copies. */
export function logFields(plan: Plan, logId: string): readonly PlanField[] {
  const log = plan.logs.find((l) => l.id === logId);
  if (!log) return [];
  if (log.fields) return log.fields;
  const src = plan.logs.find((l) => l.id === log.copy_fields_from);
  return src?.fields ?? [];
}

export function findLog(plan: Plan, logId: string): PlanLog | undefined {
  return plan.logs.find((l) => l.id === logId);
}

/** Lowercase and trim an email for comparisons. */
export function normEmail(e: string): string {
  return e.trim().toLowerCase();
}

/**
 * Resolve notify targets ("owner", "contributors", explicit emails) to a
 * de-duplicated, lowercased email list in first-seen order.
 */
export function resolveNotify(plan: Plan, notify: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (e: string) => {
    const n = normEmail(e);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  for (const t of notify) {
    if (t === "owner") add(plan.owner.email);
    else if (t === "contributors") plan.contributors.forEach((c) => add(c.email));
    else add(t);
  }
  return out;
}
