// Live mode: a server-side key that would spend the owner's money. It is OFF by design (PLAN.md 3a).
// This path exists only so the guard can be tested. It is unreachable unless the environment sets
// AI_MODE=live AND a server key. Enabling it is a scope decision for the owner, not a code change here.
import { createByokProvider, type ClientFactory } from "./byok";
import { PlannerError, type PlannerProvider } from "./types";

type Env = Record<string, string | undefined>;

export function isLiveEnabled(env: Env = process.env): boolean {
  return env.AI_MODE === "live" && Boolean(env.ANTHROPIC_API_KEY);
}

export function getLiveProvider(env: Env = process.env, clientFactory?: ClientFactory): PlannerProvider {
  const key = env.ANTHROPIC_API_KEY;
  if (env.AI_MODE !== "live" || !key) {
    throw new PlannerError("live_disabled", "live mode is not enabled", 503);
  }
  return { ...createByokProvider(key, { env, clientFactory }), mode: "live" };
}
