# Traceability

Status: updated 2026-10-11. Each requirement in `docs/requirements.md` is linked to the user stories in `docs/user-stories.md` that cover it, and to the test that proves it.

The **Test** column names the real test file or check that covers the requirement. It is **TBD** where no test exists. The **Status** column says what the test shows and what it does not. Tests run with `CI=1 pnpm -r test` (389 tests across five packages on 2026-10-11, see `docs/test-plan.md`).

How to read this table:

- **User stories** lists the story IDs (O = owner, C = contributor, V = reviewer).
- **Test** is the file path under the repository root, or a UAT step in `docs/test-plan.md` section 5.
- **Status** is a plain statement. "Pass (unit)" means the test passes against fake services or recorded plans. It does not mean the feature has run in a real Google account, which Spikes 1 to 4 and Phase 4 still need.

Short names used below:

- `plan.test.ts`, `hardening.test.ts`: `packages/plan-schema/test/`
- `entry.test.ts`, `routing.test.ts`, `reminders.test.ts`, `digest.test.ts`, `alerts.test.ts`, `sends.test.ts`: `packages/engine-logic/test/`
- `core.test.ts`: `apps-script/test/`, run against `fakeServices.ts`, not Google
- `planner.test.ts`, `caps-ratelimit-events.test.ts`, `guards.test.ts`: `apps/web/test/`
- `diff.test.ts`, `runner.test.ts`: `evals/test/`

---

## Functional requirements

| ID | Requirement | User stories | Test | Status |
|---|---|---|---|---|
| R-1 | The interview collects the ten topics in `PLAN.md` section 5, in under 10 minutes. | O-1 | TBD (UAT steps U-3 and U-4 in `docs/test-plan.md`) | TBD. The ten questions exist in `apps/web/lib/questions.ts`. Timing not measured. |
| R-2 | The AI turns answers into a plan that follows the schema. Invalid plans get one automatic retry, then a friendly error. | O-2, V-3 | `apps/web/test/planner.test.ts`, `evals/test/runner.test.ts` | Pass (unit). Retry and friendly error tested. Eval: 12 of 12 valid on first try for recorded plans only. No live model call. |
| R-3 | The validator enforces every limit and rule in `PLAN.md` section 4. | O-2, V-2 | `packages/plan-schema/test/plan.test.ts`, `packages/plan-schema/test/hardening.test.ts` | Pass (unit), 201 tests. GATE-1 records a failing fixture for each rule. |
| R-4 | The preview shows the plan in plain English without AI, and lets the owner edit before approving. | O-3, V-1 | `packages/plan-schema/test/plan.test.ts` (summary), `apps/web/test/caps-ratelimit-events.test.ts` (`POST /api/validate`). The edit screen is UAT only (U-6 to U-8). | Partly. Summary and validation pass (unit). The edit screen is not unit-tested. |
| R-5 | The owner can download the plan as JSON. | O-4 | TBD (UAT step U-9) | TBD. |
| R-6 | Demo mode runs the interview, plan, and preview without Google sign-in and ends at a view-only sample. | V-1 | `apps/web/test/planner.test.ts`, `apps/web/test/caps-ratelimit-events.test.ts` (replay through `POST /api/plan`). UAT: U-1 to U-12. | Partly. Replay passes (unit). The view-only sample link is a PLACEHOLDER, not published. UAT not yet run. |
| R-7 | On approval, the app creates the sheet in the owner's Google Drive and writes the plan into it. | O-5 | TBD | TBD. Phase 4 is not built. Spikes 1 and 2 are pending. |
| R-8 | The engine builds one tab per log, with headers, dropdowns, and date checks. | O-6 | `apps-script/test/core.test.ts` (activate builds tabs). Dropdown and date rules are set in `apps-script/src/google.ts` and are not unit-tested. | Pass (unit, fake services). Not run in Google (H2). |
| R-9 | Contributors add entries through a generated Google Form. The owner can also use a sidebar. | O-7, C-1 | `apps-script/test/core.test.ts` (form submit, sidebar) | Pass (unit, fake services). Form and permission prompt not tested in Google (Spikes 3 and 4). |
| R-10 | Entries are routed to other logs by rule, without duplicates. | O-8 | `packages/engine-logic/test/routing.test.ts`, `apps-script/test/core.test.ts` (routing and "Run routing now") | Pass (unit). Not run in Google. |
| R-11 | A daily check sends follow-up reminders. A weekly digest is optional. | O-9 | `packages/engine-logic/test/reminders.test.ts`, `packages/engine-logic/test/digest.test.ts`, `apps-script/test/core.test.ts` (hourly tick) | Pass (unit, fake services). Daylight saving covered. Not run in Google. |
| R-12 | The owner gets an alert when a contributor adds an entry. | O-10, C-3 | `packages/engine-logic/test/alerts.test.ts`, `apps-script/test/core.test.ts` | Pass (unit). Submitter identity on personal and Workspace accounts is pending Spike 4. |
| R-13 | Re-running Activate never creates duplicate triggers or deletes data. | O-11 | `apps-script/test/core.test.ts` (idempotent Activate; removes only its own triggers; never overwrites a tab) | Pass (unit, fake services). Not run in Google. |
| R-14 | Errors appear in plain language on an `Activity` tab and in the app. | O-12 | `apps-script/test/core.test.ts` (bad answer explained on Activity; invalid plan refused with a plain message), `apps/web/test/planner.test.ts` (friendly error) | Pass (unit). |

## Non-functional requirements

| ID | Requirement | User stories | Test | Status |
|---|---|---|---|---|
| N-1 | Privacy: server-side storage is limited to anonymous funnel metrics and rate-limit counters, deleted after 90 days. No emails, answers, plans, or sheet links. | O-15, V-5 | `apps/web/test/caps-ratelimit-events.test.ts` (funnel event columns; raw IP never stored). `supabase/verify.sql` is a check to run against the project. | Partly. Unit tests pass. `verify.sql` has not been run against a live project. Retention job not confirmed as applied. |
| N-2 | Security: AI output is validated before use. User-entered cell values are written as plain text. Secrets stay in environment variables. | C-2, V-2 | `packages/plan-schema/test/plan.test.ts` (text-safety rule), `packages/engine-logic/test/entry.test.ts` (cell sanitising), `apps/web/test/planner.test.ts` (key never logged or echoed) | Pass (unit). Whether Google displays the leading apostrophe in a formula-safe cell is an open H2 check. |
| N-3 | Least privilege: smallest workable Google scopes, with no restricted scopes. | O-5, V-5 | `apps-script/check.mjs` (build check: scopes limited to the allowed list), run by `pnpm --filter @logwizard/apps-script build` | Pass (build check, 5 scopes). The consent screen the user sees is not checked. |
| N-4 | Zero cost: free plans only, no billing account, no purchased domain, no server-side AI key. The app and its tests work with no AI key set. | O-14, V-6 | `apps/web/test/planner.test.ts` (runs with no environment variables), `apps/web/test/guards.test.ts` (server key read only in the live module) | Pass (unit). Billing status is a human check (`docs/setup-guide.md`). |
| N-5 | Accessibility: the web app meets WCAG 2.1 AA. | V-4 | TBD (UAT T3, keyboard only, is a partial check) | TBD. No accessibility audit has been run. |
| N-6 | Reliability: email use stays within the daily limits (100 per day for personal accounts, 1,500 per day for Workspace, per `SPIKES.md`). | O-13 | `packages/engine-logic/test/sends.test.ts`, `apps-script/test/core.test.ts` (daily cap; 80 percent warning) | Pass (unit). The limits themselves are not tested against real sending (Spike 5 is documented, not run). |
| N-7 | Testability: schema and engine decision logic are pure functions with unit tests. The AI step has an eval set with automatic pass criteria. | V-3, V-6 | `packages/engine-logic/test/*.test.ts`, `packages/plan-schema/test/*.test.ts`, `evals/test/diff.test.ts`, `evals/test/runner.test.ts` | Pass (unit). Eval set: 12 personas, graded on recorded plans only (see `docs/test-plan.md` section 4). |

---

## Coverage check

- Every functional requirement (R-1 to R-14) has at least one user story.
- Every non-functional requirement (N-1 to N-7) has at least one user story.
- Stories that appear in more than one row (for example O-7 and C-1 for R-9) cover the same requirement from two roles.
- Requirement IDs are not renumbered. A new requirement gets the next free ID and a new row here.
- Requirements with no test yet: R-1 (timing), R-5, R-7, N-5. These stay TBD until a test or UAT step covers them.
