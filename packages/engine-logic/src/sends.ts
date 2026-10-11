export const DAILY_CAPS = { personal: 100, workspace: 1500 } as const;
export const WARN_FRACTION = 0.8;

export interface SendPlan {
  /** Recipients to email now. */
  allowed: string[];
  /** Recipients left over because the cap was reached. Try again tomorrow. */
  deferred: string[];
  /** Sends used today after this batch. Never above dailyCap. */
  usedAfter: number;
  remaining: number;
  /** True when usage after this batch is at or above 80% of the cap. */
  warn: boolean;
  /** Plain-language line for the Activity tab, when relevant. */
  message?: string;
}

/**
 * Decide who can be emailed under a daily cap. Counts one send per recipient
 * (Gmail counts recipients, not messages). Duplicate addresses (ignoring case)
 * count once. Never lets total sends exceed `dailyCap`.
 * The caller passes the cap: DAILY_CAPS.personal (100) or DAILY_CAPS.workspace (1500).
 */
export function planSends(recipients: readonly string[], alreadySentToday: number, dailyCap: number): SendPlan {
  const cap = Math.max(0, Math.floor(dailyCap));
  const used = Math.max(0, Math.floor(alreadySentToday));
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const r of recipients) {
    const k = r.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      unique.push(k);
    }
  }
  const room = Math.max(0, cap - used);
  const allowed = unique.slice(0, room);
  const deferred = unique.slice(room);
  const usedAfter = used + allowed.length;
  const warn = cap > 0 && usedAfter >= cap * WARN_FRACTION;
  let message: string | undefined;
  if (deferred.length > 0) {
    message = `Daily email limit reached (${cap}). ${deferred.length} reminder email(s) were not sent and will wait until tomorrow.`;
  } else if (warn) {
    message = `Heads up: ${usedAfter} of ${cap} emails used today (80% or more).`;
  }
  return { allowed, deferred, usedAfter, remaining: Math.max(0, cap - usedAfter), warn, message };
}
