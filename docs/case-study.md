# Case study: LogWizard

Status: skeleton, 2026-10-11. Only facts that already exist are filled in. Every number that needs a measurement is marked **TO MEASURE AT H3** and stays empty until it is measured. No before-time is claimed.

Plain-language terms: an **eval** runs the AI planner on sample answers and checks the plan it produces. A **gate** is a review checkpoint in the build plan (PLAN.md section 8).

---

## Context

Aaron built a system for logging interactions (for example, emails with employers) by hand five times for a university career center. Each build involved spreadsheets, a form, copies between logs, reminder emails, and alerts. `docs/requirements.md` says each build took hours of repeated work.

LogWizard is a web app that interviews a non-technical person, turns the answers into a setup plan, shows the plan for review, and then builds the system in the person's own Google account. The AI writes a plan. Tested code builds the system. The AI never writes code that runs in an account (ADR 0002).

---

## Before

The hand-built method, as Aaron did it five times. Facts still to collect:

| Measure | Value |
|---|---|
| Aaron's hand-built setup time, per system | **TO MEASURE AT H3** |
| Manual steps in the hand-built method (clicks, copies, formulas, triggers) | **TO MEASURE AT H3** |
| Hand builds done (PLAN.md section 1 says five) | 5 (count from PLAN.md). Timings for each build: **TO MEASURE AT H3** |
| What the hand-built system did (logs, routing, reminders, alerts) | Described in `docs/requirements.md`, Problem and Users |

Do not replace the placeholders with an estimate. If the hand-built time cannot be measured again, say so in the case study rather than inventing a figure.

---

## After

### The build, as it stands

| Part | State on 2026-10-11 |
|---|---|
| Plan schema and validator | Built. 201 tests in `packages/plan-schema` pass (`test/plan.test.ts` and `test/hardening.test.ts`). |
| Engine logic (routing, reminders, digests, sends, alerts) | Built. 85 tests in `packages/engine-logic` pass. |
| Apps Script engine | Built and bundled. 52 tests in `apps-script` pass with fake services. The bundle is 227.8 KB with zod included, and it requests 5 OAuth scopes. The build check passed. |
| Web app (interview, preview, Demo mode) | Built. 66 tests in `apps/web` pass. Replay mode works with no environment variables. |
| Eval set | 12 personas, 12 recordings, graded by the runner (37 tests in `evals` pass). |
| Google build step (sign-in, Drive copy, Activate) | Not built. Phase 4. |
| Google behaviour (Activate, form, permission prompt, submitter identity, email) | Not tested. Spikes 1 to 4 are pending (`SPIKES.md`). |
| Measured end-to-end time (interview to reminder email) | **TO MEASURE AT H3** |

Total unit tests across the five packages with tests: **441** (from `CI=1 pnpm -r test`, 2026-10-11). Those tests use fake services for Google and recorded plans for the planner. They do not call Google or an AI.

### The eval, with its caveats

Source: `evals/results.md`, read 2026-10-11 at 16:33. Prompt version v1.

| Measure | Result |
|---|---|
| Personas recorded | 12 of 12 |
| Valid on first try | 12 of 12 |
| Matches the answer key with no diff issues | 11 of 12 |
| Clean on the diff and on the reply-length check | 10 of 12 |
| Invented features | 0 |

Caveats that go with every quote of these numbers:

- **Not an API measurement.** The recordings were made by Claude Code subagents on Aaron's existing Claude Code plan. No paid Anthropic API was called (ADR 0005).
- **One run per persona, planned in the same context.** The workers planned inline, not in fresh isolated subagents. The results describe what one run produced, not how often the prompt succeeds.
- **The answer key changed once after the first run.** The career-center label was loosened to accept the persona's own wording. The planner was not changed. This moved the diff-clean count from 10 to 11.
- **Two recordings still differ.** `vague-user` chose `days_before: 0` for a vague answer. `forty-fields` has a note over the 200 character cap. A v2 prompt addresses both, but it has no recordings yet.
- **Small set, same author.** The personas and the prompt were written by the same person.

### Review findings fixed before the first gate

Source: `docs/gates/GATE-1.md` and `docs/decisions/0007-schema-hardening.md`.

An independent reviewer pass on the schema found 2 high and 7 medium issues. Each was confirmed with a failing input. The fixes were made test-first: 70 new tests failed before the fixes, then passed. Examples:

- A quadratic email check. A 50,000 character input took about 4 seconds. It now runs in linear time.
- Error amplification on oversized plans, which could run out of memory. Errors are now capped.
- Time zones that depended on the runtime's ICU data. The app now checks a pinned list.
- Tab names that could clash with the engine's own tabs.
- Invisible Unicode characters in text.

The fixes themselves have not had a second independent review (`GATE-1.md`).

### The zero-cost rule

Source: PLAN.md section 3a and ADR 0005.

- No paid plan, paid API, purchased domain, or billing account is part of the design.
- Replay mode is the default. Visitors can use their own key for one request. There is no server-side AI key.
- All tests and the web build run with no keys set.
- The Google Cloud project is meant to have no billing account linked. This is a human check, not yet confirmed (`docs/setup-guide.md`).

---

## What I would do differently

*Draft from the project record. Aaron should rewrite this section in his own words before publishing.*

1. **Freeze the answer key before the first run.** The career-center key was changed after a run that showed a difference (`evals/results.md`). A key changed after seeing results is weaker evidence than one fixed in advance.
2. **Make the recordings the way the design says.** The design calls for isolated subagents. The lead notes say the workers planned inline (`evals/results.md`).
3. **Test the Google side earlier.** Spikes 1 to 4 are still pending (`SPIKES.md`), so the engine's Google assumptions are open checks (`apps-script/README.md`) and the engine has only been tested with fake services.
4. **Re-record before quoting.** The v2 prompt was written to fix two recordings, but no v2 recording exists yet, so the v1 numbers are the only ones to quote.
5. **Measure the before-state from the start.** Aaron's hand-built timings should have been recorded when the hand-built systems were made. They can still be measured at H3 if the method can be repeated, and if not, the case study should say so.
