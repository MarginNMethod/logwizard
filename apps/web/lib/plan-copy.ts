import type { Plan } from "@logwizard/plan-schema";

/** The exact text of the Download button and the Copy button: the approved plan, nothing else. */
export function planJsonForCopy(plan: Plan): string {
  return JSON.stringify(plan, null, 2) + "\n";
}
