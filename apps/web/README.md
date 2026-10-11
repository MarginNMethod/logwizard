# @logwizard/web

The LogWizard web app (Phase 3): landing page, guided interview, plan preview with live editing, and a Demo mode end page. Next.js App Router, TypeScript, Tailwind.

## Zero-cost rule

Nothing here may cost money (PLAN.md section 3a).

- The default AI mode is **replay**: recorded plans from `evals/recordings/`. No AI service is contacted.
- **Bring your own key** sends a visitor's own key for one request. The visitor pays, not the project. The key is held in page memory, travels in a request header, and is never stored, logged, echoed, or included in an error.
- **Live** mode (a server-side key that would spend the owner's money) is off and not part of the plan. `lib/planner/live.ts` throws "live mode is not enabled" unless the environment sets `AI_MODE=live` and a server key. Enabling it is a scope decision for the owner.
- Supabase (anonymous metrics, rate-limit counters) is optional. With no Supabase variables the app skips metrics and rate limits in memory only.
- The build, the tests, and the app all work with **no environment variables set**.

## Run it

From the repo root, after `pnpm install`:

```
pnpm --filter @logwizard/web dev        # http://localhost:3000, replay mode
pnpm --filter @logwizard/web test       # vitest, no browser, no network
pnpm --filter @logwizard/web typecheck
pnpm --filter @logwizard/web build
```

Each script first runs `scripts/prepare-data.mjs`, which copies into `data/`:

- `evals/recordings/*.json` to `data/recordings/` (with a generated `index.ts`),
- the persona `id`, `title`, and `answers` to `data/personas.json` (the `expected` grading block is never copied),
- `evals/planner-prompt.md` to `data/planner-prompt.ts`,
- `docs/privacy.md` to `data/privacy.ts` (rendered at `/privacy`).

Do not edit `data/` by hand. Change the sources and rerun.

## Environment variables (all optional)

See `.env.example`. `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`) picks the model for bring-your-own-key calls. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` turn on metrics and shared rate limits (server only, never sent to the browser). `RATE_LIMIT_SALT` salts the hash of the visitor IP. Raw IPs are never stored.

## Routes

| Route | What it does |
|---|---|
| `/` | Landing page |
| `/start` | Interview, preview, Demo end page (one client-side flow) |
| `/privacy` | Renders `docs/privacy.md` |
| `POST /api/plan` | Answers in, validated plan out. Body cap 16 KB before parsing, each answer 500 characters, 4000 in total, 10 requests per 10 minutes per visitor (5 when no address header exists) |
| `POST /api/validate` | Validates an edited plan and returns the plain-English summary. No AI call |
| `POST /api/events` | Anonymous funnel events (the 12 step names in `supabase/CONTRACT.md`). 30 per minute per visitor, impossible step orders dropped. No-op without Supabase |

## How replay works

The server matches the submitted answers to a recorded persona (exact match, outer whitespace ignored) and plays back its recording. Edited answers do not match, so the interview tells the visitor to add their own key. Every reply, recorded or live, goes through the same flow: `validatePlannerReply`, and on failure one retry with the validator's error list, then a friendly error.

## Bring your own key: how the call is made

`lib/planner/byok.ts` builds the SDK client with every option explicit: `apiKey` (the visitor key), `authToken: null`, `baseURL: "https://api.anthropic.com"`, `maxRetries: 0`, `timeout: 90000`. This stops the SDK from reading `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_BASE_URL` from the server environment, which could send a visitor key to another host. A test sets both variables and checks the client. A guard test fails if any file outside `live.ts` names `process.env` together with an `ANTHROPIC_` name.

The call uses structured output: one forced tool, `tool_choice: { type: "tool", name: "emit_plan" }`, whose `input_schema` is the planner reply envelope (`plan`, `follow_up_questions`, `unsupported_requests`). The reply is read from the `tool_use` block input, not parsed from text. The inside of `plan` is still checked by `validatePlannerReply`, so the schema only declares it as an object or null. A reply with no `tool_use` block returns a clear error. **The SDK call shape is verified only against a mock client, not the real API.** Nothing here contacted Anthropic.

## Rate limits

- The visitor address comes from `x-vercel-forwarded-for`, then `x-real-ip`. If only `x-forwarded-for` exists, the right-most entry is used (the first entry is client-controlled). With no usable header the key is a shared coarse bucket with a lower limit (half). Outside Vercel, a client can still set `x-real-ip`; deploy behind a proxy that overwrites it.
- The in-memory map evicts oldest-first when it passes 5000 keys. It no longer clears everything.
- The in-memory limit is always the first gate. When Supabase is configured the shared count comes from a Postgres function, `increment_rate_limit(p_key_hash text, p_window_start timestamptz)`, one atomic statement that returns the new count. The old read-then-write could lose updates. Any failure or a 1.5 s delay fails open.
- **The function does not exist yet.** The SQL is in `supabase/migrations/20261011000200_increment_rate_limit.sql` and below. The lead moves it into `supabase/migrations/`. Until then, with Supabase configured, the RPC errors and the limiter falls back to memory only.

```sql
create or replace function public.increment_rate_limit(p_key_hash text, p_window_start timestamptz)
returns integer
language sql
security invoker
set search_path = public
as $$
  insert into public.rate_limits as r (key_hash, window_start, request_count)
  values (p_key_hash, p_window_start, 1)
  on conflict (key_hash, window_start)
  do update set request_count = r.request_count + 1
  returning r.request_count;
$$;

revoke all on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;
```

## Security headers

Set in `next.config.mjs` for every path: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

The CSP is `default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, plus `img-src 'self' data: blob:` and `font-src 'self' data:`. Two allowances are looser on purpose: `script-src 'self' 'unsafe-inline'` because Next injects small inline hydration scripts and nonces would force every page to render dynamically, and `style-src 'self' 'unsafe-inline'` because the progress bar sets an inline width. `'unsafe-eval'` is added in development only. The production build passes; I have not loaded the built site in a browser with the CSP active, so check the console for CSP violations once before launch. A test reads the config.

## Metrics are not trustworthy

`/api/events` is anonymous. It is limited to 30 per minute per visitor, and it drops an event whose prerequisite step was never seen for that session (for example `build_succeeded` with no `build_started`, `plan_approved` with no `preview_opened`). The record is in memory per server instance, so on serverless a session that hops instances can lose legitimate events. This raises the cost of faking the funnel. It does not stop it: anyone can send a valid sequence with made-up session ids. The case study must describe these numbers as indicative, unauthenticated counts, not verified usage.

## Client behavior

The browser checks the reply `content-type` before reading JSON. A non-JSON reply (host error page, 413, 500) becomes a plain message chosen by status. A pasted key is checked against `^[\x21-\x7e]+$` before anything is sent; a bad key shows a message and nothing leaves the page. In the plan preview, clearing the "days before" box keeps it empty and sends `null`, so the validator reports it instead of silently saving 0. When a sample person is chosen the time zone is not pre-filled from the browser, so every sample matches its recording when untouched.

## Layout

```
app/            pages and API routes
components/     Wizard (interview), PlanPreview (editing), DemoEnd, Markdown
lib/planner/    replay.ts, byok.ts, live.ts, index.ts (validate-then-retry-once)
lib/            caps, ratelimit, events, supabase, http, validate-edit
scripts/        prepare-data.mjs
test/           vitest (node environment)
```

## Known limits

- Demo end page links to the sample sheet and the walkthrough are marked placeholders (`lib/placeholders.ts`).
- The owner name and email default to the planner's placeholder; real values come from Google sign-in in Phase 4. There is no Google code here.
- One recording has a note longer than the 200 character reply cap, so replay clips notes to 200 characters.
