import type { Plan } from "./types.js";
import { normEmail, resolveNotify } from "./types.js";

export type SubmitterKind = "owner" | "contributor" | "unknown";

export interface Submitter {
  kind: SubmitterKind;
  name?: string;
}

/** Identify a submitter from an email only. Case-insensitive, ignores surrounding spaces. */
export function identifySubmitter(plan: Plan, submitterEmail: string | null | undefined): Submitter {
  const e = normEmail(submitterEmail ?? "");
  if (e && e === normEmail(plan.owner.email)) return { kind: "owner", name: plan.owner.name };
  const c = e ? plan.contributors.find((x) => normEmail(x.email) === e) : undefined;
  return c ? { kind: "contributor", name: c.name } : { kind: "unknown" };
}

export interface AlertDecision {
  submitter: Submitter;
  /** De-duplicated emails to notify. Empty when the owner submitted or no alert applies. */
  notify: string[];
}

/**
 * Who to email when an entry arrives. Nothing when the owner submitted.
 * Anyone else (listed contributor, or an unrecognised or missing email, as
 * Google Forms can return) counts as "someone other than the owner" and
 * triggers the alerts. The submitter is never alerted about their own entry.
 */
export function alertsForSubmission(plan: Plan, submitterEmail: string | null | undefined): AlertDecision {
  const submitter = identifySubmitter(plan, submitterEmail);
  if (submitter.kind === "owner") return { submitter, notify: [] };
  const self = normEmail(submitterEmail ?? "");
  const out: string[] = [];
  for (const a of plan.alerts) {
    for (const to of resolveNotify(plan, a.notify)) {
      if (to !== self && !out.includes(to)) out.push(to);
    }
  }
  return { submitter, notify: out };
}
