# Metrics contract (web server to Supabase)

Only the Next.js server route writes to Supabase, using the service role key from Vercel environment variables. The key never reaches the browser. The browser never talks to Supabase.

## funnel_events insert

One row per funnel step. Send exactly these fields and no others:

```json
{
  "session_id": "uuid v4, generated randomly per browser session, not derived from any user data",
  "step": "interview_started | interview_completed | plan_requested | plan_generated | plan_validated | preview_opened | preview_edited | plan_approved | plan_downloaded | build_started | build_succeeded | build_failed",
  "duration_ms": 1234,
  "validation_result": "pass | fail | retry_pass",
  "retry_count": 0,
  "ai_mode": "replay | byok"
}
```

- `duration_ms`: optional (null allowed), integer 0 to 86400000, time spent on that step.
- `validation_result`: optional (null allowed), only meaningful for `plan_validated`.
- `retry_count`: integer 0 to 10, default 0.
- `ai_mode`: required. `live` is not allowed by the database.
- `id` and `created_at` are filled by the database. Do not send them.
- Never add fields for emails, answers, plans, sheet links, IP addresses, user agents, or API keys. Unknown fields must be dropped by the server before insert.

## rate_limits upsert

```json
{ "key_hash": "salted SHA-256 hex of the visitor key", "window_start": "start of the current window, ISO 8601 UTC", "request_count": 1 }
```

- Increment `request_count` for `(key_hash, window_start)` (upsert on the primary key).
- The hash is salted with a server-side secret. Raw IPs and keys are never sent.
- If the call fails, the request is allowed, but the in-process fallback limit (per server instance) still applies.

## Fail-open rule

Metrics are optional. The app must keep working if Supabase is paused, unreachable, slow, or returns an error.

- Wrap every Supabase call in try/catch with a short timeout (suggested: 1500 ms).
- Never await metrics on the user's critical path; fire and forget, or race against the timeout.
- On failure, swallow the error, log only a generic line without payload contents, and continue.
- If the service key or URL env vars are unset, skip metrics silently (this is the default in local dev and tests).
- Tests and the production build must pass with no Supabase env vars set.
- Rate limiting also fails open when Supabase is unreachable, falling back to a per-instance in-memory limit.
