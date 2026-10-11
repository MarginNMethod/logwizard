import type { Plan, Entry } from "./types.js";
import { findLog } from "./types.js";
import { entryToCells } from "./entry.js";

/**
 * Target log ids for an entry entered in `sourceLogId`.
 *
 * - choice field: matches when the value equals `includes` (case-insensitive).
 * - multi_choice field: matches when the array contains `includes`.
 * - De-duplicated, in rule order. Never contains the source log.
 * - Snapshot semantics: this reads the entry as given. Editing the original
 *   later does not change copies already written; re-running with an edited
 *   entry only adds copies to newly matching logs (existing ids are skipped).
 */
export function routeEntry(plan: Plan, sourceLogId: string, entry: Entry): string[] {
  const out: string[] = [];
  for (const rule of plan.routing_rules) {
    if (rule.from !== sourceLogId) continue;
    if (rule.copy_to === sourceLogId || out.includes(rule.copy_to)) continue;
    if (!findLog(plan, rule.copy_to)) continue;
    const v = entry.values[rule.when.field];
    const want = rule.when.includes.toLowerCase();
    const hit = Array.isArray(v)
      ? v.some((x) => x.toLowerCase() === want)
      : typeof v === "string" && v.toLowerCase() === want;
    if (hit) out.push(rule.copy_to);
  }
  return out;
}

export interface RoutedRow {
  logId: string;
  entryId: string;
  /** Sanitised cells in header order (see headersForLog). */
  cells: string[];
}

export interface RoutingPlan {
  rows: RoutedRow[];
  /** Targets that already hold this entry id, so nothing is added. */
  skippedDuplicates: string[];
}

/**
 * Rows to write per target log. `existingIdsByLog` maps log id to the entry ids
 * already in that log's tab. Idempotent: run it again with the updated ids and
 * `rows` is empty. Copies keep the same entry id as the original.
 */
export function planRouting(
  plan: Plan,
  sourceLogId: string,
  entry: Entry,
  existingIdsByLog: Record<string, Iterable<string>>,
): RoutingPlan {
  const rows: RoutedRow[] = [];
  const skippedDuplicates: string[] = [];
  for (const target of routeEntry(plan, sourceLogId, entry)) {
    const existing = new Set(existingIdsByLog[target] ?? []);
    if (existing.has(entry.id)) {
      skippedDuplicates.push(target);
      continue;
    }
    rows.push({ logId: target, entryId: entry.id, cells: entryToCells(plan, target, entry) });
  }
  return { rows, skippedDuplicates };
}
