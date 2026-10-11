import type { PlanError } from "@logwizard/plan-schema";
import type { Answers } from "../questions";

export type PlannerInput = {
  answers: Answers;
  browser_time_zone?: string;
  follow_ups_used?: number;
  follow_up_answers?: Record<string, string>;
};

export type ProviderRequest = { input: PlannerInput; validation_errors?: PlanError[] };

/** A provider returns the planner's raw reply (parsed JSON, or null if unreadable). It never validates. */
export interface PlannerProvider {
  mode: "replay" | "byok" | "live";
  generate(req: ProviderRequest): Promise<unknown>;
}

/** An error whose message is safe to show to the visitor. */
export class PlannerError extends Error {
  constructor(
    public readonly code: "replay_no_match" | "bad_key" | "provider_rejected" | "provider_rate_limited" | "provider_unavailable" | "live_disabled",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}
