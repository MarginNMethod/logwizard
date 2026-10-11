# GATE 2 report: engine, web app, evals (offline build)

Date: 2026-10-11. Type: AUTO-GATE, partial. Result: **offline checks pass; nothing has run against Google yet.**

## What was checked by the lead
| Check | Result |
|---|---|
| `CI=1 pnpm -r test` | 441 pass: plan-schema 201, engine-logic 85, apps-script 52, web 66, evals 37 |
| Typecheck, all packages | Clean |
| Apps Script `build` and `check.mjs` | Pass. 227.8 KB, 5 OAuth scopes, no import or export left |
| Web `build` with no environment variables | Pass (zero-cost guard) |
| Tests with no AI key set | Pass |
| Em dash scan, `example.com` only, secret scan of reachable history | Clean (security reviewer scanned 287 reachable blobs) |

## Independent reviews
- Phase 1 schema review: 2 high, 7 medium findings, all fixed (ADR 0007).
- Apps Script and web review: 4 high, 8 medium, 9 low. All fixed except one noted below; fixes were written test first.
- Security and privacy review: no critical or high findings. Three medium findings: privacy notice wording (fixed), retention not guaranteed (notice softened, launch step added), repository inside iCloud (open item 12, your decision).

## Known gaps (honest list)
- **Nothing has run in Google.** `apps-script/src/google.ts` is typechecked only. Spikes 2, 3, 4 and the 21 numbered H2 checks are the first real test.
- **Web app has not been driven in a browser.** No accessibility audit, CSP not exercised, download and live preview editing not clicked through.
- **BYOK call is mock-tested only.** Not run against the real Anthropic API.
- **Supabase and Vercel projects do not exist.** Migrations are unapplied.
- **Engine logic was written before its tests** (not tests-first). Tests were written after and one wrong expectation of the worker's own was fixed.
- **Eval caveats:** planning happened in the workers' own contexts (not isolated fresh subagents); the `career-center` key was loosened, not the planner; `forty-fields` fails the reply-format check; `vague-user` is a real miss. Prompt v2 exists but has no recordings.
- **One reviewer finding not fixed:** an old form with a question titled "Your name" next to a plan field with the same label (A11, needs form item ids).
- **Rate-limit follow-ups** in `docs/OPEN_ITEMS.md` items 7 to 13.

## Needs Aaron
See `docs/OPEN_ITEMS.md` and `docs/setup-guide.md` (H0 to H3).
