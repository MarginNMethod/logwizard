import type { Plan, PlanError } from "@logwizard/plan-schema";
import { BYOK_HEADER } from "../planner/header";
import type { Answers } from "../questions";

export type PlanResponse =
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
  | { ok: false; code: string; message: string; errors?: PlanError[] };

export type ValidateResponse = { ok: true; plan: Plan; summary: string } | { ok: false; errors: PlanError[] };

const NETWORK_ERROR = { ok: false as const, code: "network", message: "Could not reach the server. Check your connection and try again." };

/** The key goes in a header for this one request. It is not stored anywhere in the browser. */
export async function requestPlan(args: {
  answers: Answers;
  browserTimeZone?: string;
  apiKey?: string;
  followUps?: Record<string, string>;
  followUpsUsed?: number;
}): Promise<PlanResponse> {
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", ...(args.apiKey ? { [BYOK_HEADER]: args.apiKey } : {}) },
      body: JSON.stringify({
        answers: args.answers,
        browser_time_zone: args.browserTimeZone,
        follow_up_answers: args.followUps,
        follow_ups_used: args.followUpsUsed,
      }),
    });
    return (await res.json()) as PlanResponse;
  } catch {
    return NETWORK_ERROR;
  }
}

export async function requestValidate(plan: Plan): Promise<ValidateResponse> {
  try {
    const res = await fetch("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    return (await res.json()) as ValidateResponse;
  } catch {
    return { ok: false, errors: [{ path: "(request)", message: NETWORK_ERROR.message }] };
  }
}
