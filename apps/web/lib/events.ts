import { getSupabase, withTimeout } from "./supabase";

type Env = Record<string, string | undefined>;

/** Exactly the 12 step names in supabase/CONTRACT.md. */
export const FUNNEL_STEPS = [
  "interview_started",
  "interview_completed",
  "plan_requested",
  "plan_generated",
  "plan_validated",
  "preview_opened",
  "preview_edited",
  "plan_approved",
  "plan_downloaded",
  "build_started",
  "build_succeeded",
  "build_failed",
] as const;

export type FunnelEvent = {
  session_id: string;
  step: (typeof FUNNEL_STEPS)[number];
  duration_ms: number | null;
  validation_result: "pass" | "fail" | "retry_pass" | null;
  retry_count: number;
  ai_mode: "replay" | "byok";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULTS = ["pass", "fail", "retry_pass"];
const MODES = ["replay", "byok"];

/** Whitelists the contract columns. Unknown fields are dropped. Returns null if invalid. */
export function sanitizeEvent(body: unknown): FunnelEvent | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.session_id !== "string" || !UUID.test(b.session_id)) return null;
  if (typeof b.step !== "string" || !(FUNNEL_STEPS as readonly string[]).includes(b.step)) return null;
  if (typeof b.ai_mode !== "string" || !MODES.includes(b.ai_mode)) return null;

  let duration_ms: number | null = null;
  if (b.duration_ms !== undefined && b.duration_ms !== null) {
    if (typeof b.duration_ms !== "number" || !Number.isInteger(b.duration_ms) || b.duration_ms < 0 || b.duration_ms > 86_400_000) return null;
    duration_ms = b.duration_ms;
  }
  let validation_result: FunnelEvent["validation_result"] = null;
  if (b.validation_result !== undefined && b.validation_result !== null) {
    if (typeof b.validation_result !== "string" || !RESULTS.includes(b.validation_result)) return null;
    validation_result = b.validation_result as FunnelEvent["validation_result"];
  }
  let retry_count = 0;
  if (b.retry_count !== undefined && b.retry_count !== null) {
    if (typeof b.retry_count !== "number" || !Number.isInteger(b.retry_count) || b.retry_count < 0 || b.retry_count > 10) return null;
    retry_count = b.retry_count;
  }
  return { session_id: b.session_id.toLowerCase(), step: b.step as FunnelEvent["step"], duration_ms, validation_result, retry_count, ai_mode: b.ai_mode as FunnelEvent["ai_mode"] };
}

/** Inserts one funnel event. No-op without Supabase env. Never throws; fails open. */
export async function recordEvent(
  event: FunnelEvent,
  opts: { env?: Env; insert?: (row: FunnelEvent) => Promise<void> } = {},
): Promise<"skipped" | "stored" | "failed"> {
  let insert = opts.insert;
  if (!insert) {
    const sb = getSupabase(opts.env ?? process.env);
    if (!sb) return "skipped";
    insert = async (row) => {
      const { error } = await sb.from("funnel_events").insert(row);
      if (error) throw new Error("insert failed");
    };
  }
  try {
    await withTimeout(insert(event));
    return "stored";
  } catch {
    console.warn("metrics unavailable; event dropped");
    return "failed";
  }
}
