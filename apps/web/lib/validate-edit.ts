import { plainEnglishSummary, validatePlan } from "@logwizard/plan-schema";

/** Validates an edited plan and returns the plain-English summary. Pure; no AI call. */
export function validateEditedPlan(body: unknown) {
  if (typeof body !== "object" || body === null || !("plan" in body)) {
    return { status: 400, body: { ok: false as const, errors: [{ path: "(request)", message: "Send an object with a plan property." }] } };
  }
  const result = validatePlan((body as { plan: unknown }).plan);
  if (!result.ok) return { status: 200, body: { ok: false as const, errors: result.errors } };
  return { status: 200, body: { ok: true as const, plan: result.plan, summary: plainEnglishSummary(result.plan) } };
}
