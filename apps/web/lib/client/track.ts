// Anonymous funnel events (supabase/CONTRACT.md). The session id is random, lives only in memory,
// and is not derived from anything the visitor typed. Failures are ignored.
export type Step =
  | "interview_started"
  | "interview_completed"
  | "plan_requested"
  | "plan_generated"
  | "plan_validated"
  | "preview_opened"
  | "preview_edited"
  | "plan_approved"
  | "plan_downloaded";

let sessionId: string | null = null;

function session(): string {
  if (!sessionId) sessionId = crypto.randomUUID();
  return sessionId;
}

export function track(
  step: Step,
  aiMode: "replay" | "byok",
  extra: { duration_ms?: number; validation_result?: "pass" | "fail" | "retry_pass"; retry_count?: number } = {},
): void {
  try {
    void fetch("/api/events", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: session(),
        step,
        ai_mode: aiMode,
        duration_ms: extra.duration_ms === undefined ? undefined : Math.max(0, Math.round(extra.duration_ms)),
        validation_result: extra.validation_result,
        retry_count: extra.retry_count,
      }),
    }).catch(() => undefined);
  } catch {
    // Metrics are optional.
  }
}
