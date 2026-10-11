# Test plan

Status: written 2026-10-11 from the code and from the test run recorded in section 2. Google-side behaviour is not tested yet (section 6).

Plain-language terms: a **unit test** checks one function or rule with fixed inputs. An **eval** runs the AI planner prompt on sample interview answers and checks the plan it produces. A **UAT** (user acceptance test) is a script that someone who did not build the app follows, step by step, to see whether it does what it promises.

---

## 1. What to run

| Check | Command | Needs keys or network? |
|---|---|---|
| All unit tests | `CI=1 pnpm -r test` (or `pnpm -r test`) | No |
| Schema typecheck | `pnpm --filter @logwizard/plan-schema typecheck` | No |
| Engine bundle | `pnpm --filter @logwizard/apps-script build` | No |
| Web app in demo mode | `pnpm --filter @logwizard/web dev`, then open `http://localhost:3000/start` | No |
| Eval grading | `cd evals && pnpm run run --no-write` | No (reads files on disk) |

The project must pass with no AI key set. The web tests include guards that fail if the server key is read anywhere except the live module (`apps/web/test/guards.test.ts`).

---

## 2. Unit tests by package

Counts are from `CI=1 pnpm -r test` run on 2026-10-11 (exit code 0). Each row is one test file as reported by Vitest v2.1.9. The eval counts changed during the day as the eval team edited `evals/test/`; this table is from the final run made for this document.

| Package | Test file | Tests | What it covers |
|---|---|---|---|
| `packages/plan-schema` | `test/plan.test.ts` | 97 | Fixtures (valid and invalid), validator errors, text-safety rule, time zones, `plainEnglishSummary` |
| `packages/plan-schema` | `test/hardening.test.ts` | 104 | Review findings from ADR 0007: email check speed, input size, pinned time zones, reserved names, Unicode, error hygiene, sign rule, planner reply envelope |
| `packages/engine-logic` | `test/entry.test.ts` | 27 | Entry IDs, cell sanitising, normalising each field type, headers and cells |
| `packages/engine-logic` | `test/routing.test.ts` | 12 | Routing matches, duplicates, idempotence, snapshots |
| `packages/engine-logic` | `test/reminders.test.ts` | 18 | Follow-up dates, send hour, daylight saving (spring and fall), Asia/Kolkata and UTC, grouping per person |
| `packages/engine-logic` | `test/digest.test.ts` | 11 | Weekly digest day, time zone, grouping, totals |
| `packages/engine-logic` | `test/alerts.test.ts` | 8 | Who is alerted, and when |
| `packages/engine-logic` | `test/sends.test.ts` | 9 | Daily caps, 80 percent warning, deferred sends, duplicates |
| `apps-script` | `test/core.test.ts`, `test/fixes.test.ts` | 52 | Activate (idempotent, own triggers only, never overwrites a tab, plan edits), form submit, sidebar, routing, hourly tick with reserve-then-send accounting, lock timeouts, daily cap and alert budget, verified email handling, test reminder |
| `apps/web` | `test/planner.test.ts`, `test/caps-ratelimit-events.test.ts`, `test/guards.test.ts`, `test/fixes.test.ts` | 66 | Replay and bring-your-own-key planner (key never logged, server credentials ignored), live mode off by default, input caps, rate limit (client address, fail-open), funnel events, security headers, sample personas replay, repository guards |
| `evals` | `test/diff.test.ts` | 17 | Diff rules between a plan and its `expected` block |
| `evals` | `test/runner.test.ts` | 20 | Provenance checks, grading, `results.md` content |
| **Total** | | **441** | |

Notes:

- The root package has no test script, so it is not counted.
- `packages/engine-logic` and `apps-script` tests use fake services (`apps-script/test/fakeServices.ts`). They do not call Google.
- The eval counts are for the runner and its diff rules. They do not measure the planner (section 4).

---

## 3. Other checks run on 2026-10-11

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Already up to date. Lockfile unchanged. |
| `pnpm --filter @logwizard/apps-script build` | Built `dist/Code.js` (212.1 KB, zod bundled), 5 OAuth scopes, `check.mjs` passed. `dist/` is git-ignored. |
| `pnpm --filter @logwizard/web dev` with no `.env.local` | `/` returns 200, `/start` returns 200, `/privacy` returns 200. |
| `POST /api/plan` with the sample persona `career-center` answers | `ok: true`, `mode: replay`, `validation_result: pass`, `retry_count: 0`. Four logs in the plan. |

These were run by hand from the command line. They are not part of `pnpm -r test`.

---

## 4. The eval set

### 4.1 What it measures

- **Persona answers.** 12 synthetic personas in `evals/personas/`, each with the 10 interview answers and an `expected` block. None uses a real person or a real address. Email addresses use `example.com`.
- **Valid on first try and after one retry.** Each recorded plan goes through the real validator (`packages/plan-schema`) inside the runner. The runner does not trust the recorded validation block.
- **Diff against `expected`.** A mechanical comparison: missing features, invented features (logs, routing, reminders, alerts, contributors), days, time zone, required field labels, refusals, limits, and formula or code strings. Extra fields are listed for information and are not counted as invented.
- **Envelope.** The planner reply's notes must fit the 200 character cap, with at most 2 follow-up questions. This is checked separately from the plan.

### 4.2 Results (from `evals/results.md`, read 2026-10-11 16:33)

Prompt version v1. Recorded personas: 12 of 12.

| Measure | Result |
|---|---|
| Valid on first try | 12 of 12 |
| Valid after one retry (includes first-try passes) | 12 of 12 |
| Diff-clean (matches `expected`, no diff issues) | 11 of 12 |
| Envelope within caps | 11 of 12 |
| Clean on both diff and envelope | 10 of 12 |
| Invented features | 0 |
| Missing features | 0 |

The two recordings that are not clean:

| Persona | Problem | Source |
|---|---|---|
| `vague-user` | Planner set `days_before: 0` for the answer "I guess so?". The key expects 1, 2, 3, or 7. The v1 prompt gives no default. | `results.md` |
| `forty-fields` | The `unsupported_requests` note is over the 200 character cap. The plan is valid, but the real reply check would reject it. | `results.md` |

### 4.3 Changes that affect how to read the numbers

- **The answer key changed after the first run.** The first run marked `career-center` as "differs from expected" because the key required the label "Organization" and the plan used "Organization name", which is the persona's own wording. The key now accepts either label (`field_label_alternatives`). The planner prompt was not changed. This moved the diff-clean count from 10 to 11. Any report must say so.
- **An earlier read of `results.md` showed 10 of 12 diff-clean.** That number is from before the key change. The file as read on 2026-10-11 at 16:33 says 11 of 12 diff-clean and 10 of 12 clean on both checks. This document uses that version. The eval files are still being edited, so re-read `results.md` before quoting numbers.
- **v2 prompt has no recordings yet.** `evals/planner-prompt.v2.md` tightens both gaps above. It is not graded. `results.md` reports 12 of 12 as not recorded for v2.

### 4.4 Limits (say these every time the numbers are quoted)

1. **One run per persona.** This shows what one run produced. It does not show how often the prompt succeeds.
2. **Same context, not isolated.** The workers that wrote the recordings planned inline, not in fresh isolated subagents (`results.md`, lead notes). This is a weaker measurement than the design intends.
3. **Same author.** The personas and the prompt were written by the same author. The answer key was also changed once after a run (4.3).
4. **Not an API measurement.** No paid Anthropic API was called (ADR 0005). The numbers describe the planner prompt and schema, not a model served through the API.
5. **Mechanical diff.** The diff cannot judge whether an extra field is sensible.
6. **Small set.** 12 personas. The target in PLAN.md section 5 (10 of 10 valid after one retry, zero invented features) applies to a larger set and needs every persona recorded.

---

## 5. User acceptance test (UAT) for 3 testers

### 5.1 Purpose

Check that a first-time visitor can run Demo mode from start to finish, understand the preview, make a valid change, and see what the full version would do next. This test covers Demo mode only. It does not test Google sign-in, the sheet build, the form, or email (section 6).

### 5.2 Who tests

| Tester | Role | Sample persona to use | Special condition |
|---|---|---|---|
| T1 | A non-technical team lead | `teacher-parent-contacts` (Teacher tracking parent contacts) | Uses a mouse and a desktop browser |
| T2 | A non-technical nonprofit staff member | `nonprofit-donors` (Small nonprofit tracking donor contacts) | Uses a laptop with the window narrowed to about 400 pixels wide |
| T3 | A hiring manager who has a few minutes and will not sign in | `career-center` (University career center tracking employer outreach) | Uses the keyboard only, Tab and Enter, no mouse |

Testers should not be told the expected results before they start. They should not enter any API key, real email, or real name. If a field asks for a name, they use `Tester`.

### 5.3 Before the session

1. Open the app at `http://localhost:3000` or the preview URL the team gives you.
2. Use a current desktop browser. Clear the browser's saved data for the site if you have used it before.
3. Have a note file open for your comments.

### 5.4 Steps

Each step lists the action, then what you should see. If a step does not match, write it in the timing sheet and go on to the next step unless the step says to stop.

**U-1. Find Demo mode.**
- Action: On the home page, click **Try Demo mode**.
- Expected: The page **Start the interview** opens. The address ends in `/start`.

**U-2. Choose a sample person.**
- Action: In **Sample person**, choose your persona from section 5.2.
- Expected: All 10 answers fill in. The note under the dropdown says "Choosing one fills in all ten answers." The line under the key box says "Mode: Demo (recorded plan, no AI call)." **Begin the interview** is now enabled.

**U-3. Go through the questions.**
- Action: Click **Begin the interview**. Click **Next** until question 10. Click **Back** once, then **Next** again.
- Expected: The heading shows "Question 1 of 10" and the progress bar moves. The character count shows "of 500 characters". Back and Next keep the typed answers.

**U-4. Create the plan.**
- Action: On question 10, click **Create my plan**.
- Expected: The text "Creating your plan" appears briefly. Then **Review your plan** opens. The check line says "passed on the first try", which is what the recordings for all three personas show (`evals/results.md`).
- Note: If a screen titled **A couple more details** appears, answer the questions and click **Create my plan**.

**U-5. Read the plan in plain English.**
- Action: Read the summary at the top of the preview. Find **Things I left out**.
- Expected: The summary names the system, the time zone, each log with its fields, the reminders, and the alerts. Write down any sentence you could not understand.

**U-6. Make a valid edit.**
- Action: In **Edit your plan**, change one field label to a new name, for example add the word "(new)" at the end.
- Expected: The text "Checking your changes..." appears, then "Your plan passes all checks."

**U-7. Make an invalid edit.**
- Action: Clear one field label completely, so it is empty.
- Expected: A red box titled "Fix this problem to continue" lists a plain message. **Download plan as JSON** and **Approve and finish demo** are disabled.

**U-8. Fix the edit.**
- Action: Type the label back.
- Expected: "Your plan passes all checks" appears again, and both buttons are enabled.

**U-9. Download the plan.**
- Action: Click **Download plan as JSON**.
- Expected: A file is saved. Its name is the system name in lower case with dashes, ending in `.json`. Open it in a text editor. It contains `"schema_version": 1`.

**U-10. Approve.**
- Action: Click **Approve and finish demo**.
- Expected: The heading reads "Your plan for ... is approved (Demo mode)". The text says nothing was built in a Google account. Two items show the word **PLACEHOLDER**: the view-only sample sheet and the recorded walkthrough. This is expected until those links are published.

**U-11. Privacy notice.**
- Action: Click **privacy notice** on the end page.
- Expected: The privacy page opens with headings including "The short version" and "What we never collect".

**U-12. Start over.**
- Action: Go back to the end page and click **Start over**.
- Expected: **Start the interview** opens again with no sample selected.

**U-13. Edited answers in Demo mode (run only if time allows).**
- Action: Choose your persona, then change the text of one answer on question 3. Click **Begin the interview** and go to question 10. Click **Create my plan**.
- Expected: An amber note appears on the question screen: "You changed a sample answer. Demo mode can only replay the sample as written." After submitting, the message reads: "Demo mode can only replay the sample personas. Pick a sample, or add your own AI key to use your own answers." Do not enter a key.

### 5.5 Pass rule

A tester passes if U-1 to U-10 and U-12 are met. U-11 and U-13 are recorded but do not decide pass or fail. Each tester writes one sentence about anything that confused them.

### 5.6 Timing sheet

Times are for the tester to fill in during the session. None has been measured yet.

| Tester | Step | Started (mm:ss) | Finished (mm:ss) | Duration (s) | Met expected? (Y/N) | Needed help? (Y/N) | Notes |
|---|---|---|---|---|---|---|---|
| T1 | U-1 to U-12 | | | | | | |
| T2 | U-1 to U-12 | | | | | | |
| T3 | U-1 to U-12 | | | | | | |
| All | Whole session | | | | | | |

Add one row per step if the team wants per-step timing. The time from U-1 to U-10 is the figure to compare with the 10-minute interview target (requirements R-1, PLAN.md section 5). That is a different check from the 20-minute overall goal (G-1), which needs the Google build.

### 5.7 Recording results

The team lead records each tester's pass or fail and their sentence in the next gate report under `docs/gates/`. This document does not hold results.

---

## 6. What is not tested yet

| Area | Status | Why it matters |
|---|---|---|
| Google sign-in and the Drive copy of the template | Not built (Phase 4) | Required for the real product |
| Activate, the permission prompt, and the triggers in a real Google account | Not tested. Spikes 1 to 4 are pending. | The engine is tested only with fake services |
| Form submit as a contributor, identity in "Entered by" | Not tested. Spike 4 pending. | Decides the fallback "Your name" question |
| Email delivery and the daily cap in a real account | Not tested. Spike 5 is documented, not run. | Reminders and alerts depend on it |
| WCAG 2.1 AA (requirement N-5) | Not audited. The UAT in section 5 uses keyboard-only for T3 only. | Required by the requirements |
| Live planner calls | Not run. No key, no paid call (ADR 0005). | Recordings were made by subagents, not the API |
| Supabase metrics writes | Tested with stubs. Not checked against a live project. | Optional; the app must work without it |
| Eval numbers beyond 12 personas and one run | Not measured | See 4.4 |
| The end-to-end time target (under 20 minutes) | Not measured. Planned for H3. | Case study placeholder |
