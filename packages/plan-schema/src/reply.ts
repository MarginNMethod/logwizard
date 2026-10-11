import { z } from "zod";
import { PlanObjectSchema, crossChecks, type Plan } from "./schema.js";
import { MAX_PLAN_BYTES, jsonSize, toErrors, type PlanError } from "./validate.js";
import { safeText } from "./text.js";

/** Limits for the planner reply envelope (see evals/planner-prompt.md). */
export const REPLY_LIMITS = { maxNoteLength: 200, maxFollowUpQuestions: 2, maxUnsupported: 20 } as const;

/**
 * The planner's whole reply: { plan, follow_up_questions, unsupported_requests }.
 * `plan` is checked separately by validatePlannerReply (the full plan rules), so it is only
 * required to be an object or null here.
 */
export const PlannerReplySchema = z
  .object({
    plan: z.union([z.null(), z.record(z.unknown())], { errorMap: () => ({ message: "plan must be an object or null" }) }),
    follow_up_questions: z
      .array(safeText("Follow-up question", REPLY_LIMITS.maxNoteLength))
      .max(REPLY_LIMITS.maxFollowUpQuestions, `Ask at most ${REPLY_LIMITS.maxFollowUpQuestions} follow-up questions`),
    unsupported_requests: z
      .array(safeText("Unsupported request note", REPLY_LIMITS.maxNoteLength))
      .max(REPLY_LIMITS.maxUnsupported, `List at most ${REPLY_LIMITS.maxUnsupported} unsupported requests`),
  })
  .strict();

export type PlannerReply = { plan: Plan | null; follow_up_questions: string[]; unsupported_requests: string[] };
export type PlannerReplyResult = { ok: true; reply: PlannerReply } | { ok: false; errors: PlanError[] };

/** Validates the planner reply envelope and the plan inside it. Plan error paths are prefixed with "plan.". */
export function validatePlannerReply(input: unknown): PlannerReplyResult {
  const size = jsonSize(input);
  if (size === null) return { ok: false, errors: [{ path: "(reply)", message: "The reply could not be read as JSON data" }] };
  if (size > MAX_PLAN_BYTES * 2) return { ok: false, errors: [{ path: "(reply)", message: "The reply is too large. Shorten it and stay within the limits" }] };

  const env = PlannerReplySchema.safeParse(input);
  if (!env.success) return { ok: false, errors: toErrors(env.error.issues) };
  const { plan, follow_up_questions, unsupported_requests } = env.data;

  if (plan === null) {
    if (follow_up_questions.length === 0) {
      return { ok: false, errors: [{ path: "plan", message: "plan may be null only when there is at least one follow-up question" }] };
    }
    return { ok: true, reply: { plan: null, follow_up_questions, unsupported_requests } };
  }

  const parsed = PlanObjectSchema.safeParse(plan);
  const issues: z.ZodIssue[] = parsed.success ? [] : parsed.error.issues;
  if (parsed.success) {
    crossChecks(parsed.data, { addIssue: (i) => issues.push({ ...i, path: i.path ?? [], message: i.message ?? "" } as z.ZodIssue) });
  }
  if (issues.length > 0) {
    return { ok: false, errors: toErrors(issues.map((i) => ({ ...i, path: ["plan", ...i.path] }))) };
  }
  return { ok: true, reply: { plan: parsed.success ? parsed.data : null, follow_up_questions, unsupported_requests } };
}
