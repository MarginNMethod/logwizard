import { plainEnglishSummary, validatePlannerReply, type Plan, type PlanError } from "@logwizard/plan-schema";
import { checkPlanRequest } from "../caps";
import { createByokProvider, type ClientFactory } from "./byok";
import { BYOK_HEADER } from "./header";
import { getLiveProvider } from "./live";
import { createReplayProvider } from "./replay";
import { PlannerError, type PlannerInput, type PlannerProvider } from "./types";

export type PlannerOutcome =
  | {
      ok: true;
      mode: "replay" | "byok" | "live";
      plan: Plan | null;
      summary: string | null;
      follow_up_questions: string[];
      unsupported_requests: string[];
      validation_result: "pass" | "retry_pass";
      retry_count: 0 | 1;
    }
  | { ok: false; status: number; code: string; message: string; errors?: PlanError[] };

/** One call, validate, and on failure ONE retry with the validator's error list. */
export async function runPlanner(provider: PlannerProvider, input: PlannerInput): Promise<PlannerOutcome> {
  try {
    const first = validatePlannerReply(await provider.generate({ input }));
    if (first.ok) return success(provider, first.reply, "pass", 0);

    const second = validatePlannerReply(await provider.generate({ input, validation_errors: first.errors }));
    if (second.ok) return success(provider, second.reply, "retry_pass", 1);
    return {
      ok: false,
      status: 422,
      code: "invalid_plan",
      message: "The planner could not produce a valid plan from those answers, even after one retry. Try simpler answers.",
      errors: second.errors.slice(0, 10),
    };
  } catch (error) {
    if (error instanceof PlannerError) return { ok: false, status: error.status, code: error.code, message: error.message };
    return { ok: false, status: 500, code: "planner_failed", message: "Something went wrong while making the plan." };
  }
}

function success(
  provider: PlannerProvider,
  reply: { plan: Plan | null; follow_up_questions: string[]; unsupported_requests: string[] },
  validation_result: "pass" | "retry_pass",
  retry_count: 0 | 1,
): PlannerOutcome {
  return {
    ok: true,
    mode: provider.mode,
    plan: reply.plan,
    summary: reply.plan ? plainEnglishSummary(reply.plan) : null,
    follow_up_questions: reply.follow_up_questions,
    unsupported_requests: reply.unsupported_requests,
    validation_result,
    retry_count,
  };
}

/**
 * Picks the provider. A visitor key header means byok. Live is used only when the environment turns
 * it on (it never is by default). Otherwise replay.
 */
export function selectProvider(
  headers: Headers,
  input: PlannerInput,
  env: Record<string, string | undefined> = process.env,
  clientFactory?: ClientFactory,
): PlannerProvider {
  const key = headers.get(BYOK_HEADER)?.trim();
  if (key) return createByokProvider(key, { env, clientFactory });
  if (env.AI_MODE === "live") return getLiveProvider(env, clientFactory);
  return createReplayProvider(input.answers);
}

/** Parses, caps, picks a provider, and runs the planner. The whole /api/plan flow minus HTTP. */
export async function handlePlanRequest(
  body: unknown,
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
  clientFactory?: ClientFactory,
): Promise<PlannerOutcome> {
  const checked = checkPlanRequest(body);
  if (!checked.ok) return { ok: false, status: 400, code: "bad_input", message: checked.message };
  const input: PlannerInput = checked.value;
  try {
    return await runPlanner(selectProvider(headers, input, env, clientFactory), input);
  } catch (error) {
    if (error instanceof PlannerError) return { ok: false, status: error.status, code: error.code, message: error.message };
    return { ok: false, status: 500, code: "planner_failed", message: "Something went wrong while making the plan." };
  }
}
