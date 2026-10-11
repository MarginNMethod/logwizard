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
| `POST /api/plan` | Answers in, validated plan out. Body cap 16 KB before parsing, each answer 500 characters, 4000 in total, 10 requests per 10 minutes per visitor |
| `POST /api/validate` | Validates an edited plan and returns the plain-English summary. No AI call |
| `POST /api/events` | Anonymous funnel events (the 12 step names in `supabase/CONTRACT.md`). No-op without Supabase |

## How replay works

The server matches the submitted answers to a recorded persona (exact match, outer whitespace ignored) and plays back its recording. Edited answers do not match, so the interview tells the visitor to add their own key. Every reply, recorded or live, goes through the same flow: `validatePlannerReply`, and on failure one retry with the validator's error list, then a friendly error.

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
