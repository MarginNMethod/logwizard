# Case study: LogWizard

Status: final draft, 2026-10-12. Every number below comes from a test, a run or a record in this repository. The only things left empty are the before-and-after setup times, which have not been measured. No time saving is claimed.

Plain-language terms: an **eval** runs the AI planner on sample answers and checks the plan it produces. A **gate** is a review checkpoint in the build plan. **Apps Script** is Google's built-in scripting for Sheets and Forms.

---

## In one minute

**The problem.** A university career center needed a way to log contacts with employers: a spreadsheet, an entry form, copies of entries between related logs, reminder emails and alerts. I built that system by hand five times. Each build was hours of repeated, error-prone setup.

**The idea.** A person answers ten plain questions. An AI writes a setup plan as data, not code. A strict checker validates the plan and shows it in plain English. Only then does ordinary, tested code build the system in the person's own Google account. The AI never writes code that runs in someone's account.

**What exists.**
- A live demo anyone can try with no sign-in and no key: https://logwizard.vercel.app
- 456 automated tests.
- A Google engine that I installed and ran in a real Google account. It built the sheet tabs, a Form and two triggers, took entries from the Form and the sidebar, and sent a digest and a follow-up reminder.
- A 12-person synthetic eval set for the AI planner.

**What does not exist.** The web app does not yet sign a visitor in to Google and install the engine for them. Today I install the engine by hand and test it directly. That connecting step is the main unfinished part, and I say so instead of showing a fake end-to-end flow.

**Cost.** Zero. Free plans only, and no AI key on the server.

---

## Context

I built an interaction-logging system for a university career center five times, each time from scratch. Each build involved spreadsheets, a form, copies between logs, reminder emails and alerts (`docs/requirements.md`).

LogWizard asks whether that setup can be generated safely from a conversation. The hard part is safety, not generation: the output touches a real person's Google account, so a wrong answer from an AI must not be able to do damage.

---

## Approach: the AI writes a plan, not code

Three design rules drove everything (`docs/decisions/`):

1. **A plan, not code (ADR 0002).** The AI produces JSON. The code that runs in the account is written, reviewed and tested ahead of time. A bad plan is caught by validation and by the person reading the preview. A bad script would run with the user's own permissions.
2. **Zero cost (ADR 0005).** The default planner replays recorded plans. A visitor may bring their own key for one request. There is no server-side AI key, so there is nothing to abuse.
3. **Store almost nothing (privacy doc).** The server keeps only anonymous funnel counts and rate-limit counters. No answers, plans, emails or sheet links.

---

## What I built

| Part | What it does | Evidence |
|---|---|---|
| Plan schema and validator | Defines every allowed plan, with strict limits | 201 tests |
| Engine logic | Routing, reminders, digests, send caps and alerts as pure functions | 85 tests |
| Apps Script engine | Builds tabs, a Form and triggers, takes entries, sends mail. One 228.7 KB file, 6 OAuth scopes, none restricted | 67 tests, plus real-Google runs |
| Web app | Interview, plan preview with editing, plan download, Demo mode | 66 tests, live site |
| Eval set | 12 synthetic personas, recorded plans, a grading runner | 37 tests |
| Metrics | Anonymous funnel events in Supabase, with row-level security and a 90-day cleanup job | Applied and checked on the live project |

**456 tests in total.** They use fake Google services and recorded plans. They do not call Google or an AI.

---

## What went wrong, and what it taught me

This is the part I would want a hiring manager to read.

### 1. Independent review found real defects before any user could

Before the first gate, a separate reviewer pass on the schema found 2 high and 7 medium issues, each confirmed with a failing input. I fixed them test-first: 70 new tests failed before the fixes and passed after (`docs/gates/GATE-1.md`, ADR 0007). Examples: a 50,000-character input took about 4 seconds to check and now runs in linear time; oversized plans could exhaust memory through error amplification; time zones depended on the runtime's data and now use a pinned list; invisible Unicode characters were allowed in text. Later reviews of the Apps Script engine and the web app found a lock and accounting problem and a leak of a user-supplied API key into logs. All were fixed test-first.

### 2. A real Google test caught a bug that 450 tests could not

In the first real-Google run, a form answer of `=SUM(A1)` in a text field showed `0`. Google evaluated it as a formula, even though the column was formatted as plain text. Anyone able to use the entry Form could therefore have put formulas into the owner's sheet.

The offline tests missed it because the fake Google I wrote did not behave that way. The fix prefixes any cell that starts with `=`, `+`, `-` or `@` with an apostrophe, except values that exactly match a dropdown option. I also changed the fake so it evaluates formulas the way Google does, wrote 15 tests for it, and re-tested in real Google after pushing: the same input now stays text. The lesson: a fake can only be as right as my understanding of the real thing, so the real thing needs a test too.

### 3. Real Google behaved differently in three more ways

- **Permissions.** Google's first-run screen listed exactly five permissions, matching the five scopes I pinned, and nothing broad (no Gmail read, no all-of-Drive, no contacts).
- **Who entered it.** The owner's own sidebar entries were recorded as `unknown`, because the engine never asked Google for the signed-in email. I did not paper over this by assuming a blank user is the owner, since that would let a collaborator pass as the owner and skip the alert. I added one non-sensitive scope (`userinfo.email`), re-tested, and the owner's email was recorded.
- **Two accounts.** With two Google accounts signed in to one browser, the sidebar's Save failed with `PERMISSION_DENIED` before my code ran. It worked with one account. That is a Google limitation, so it is now in the setup guide.

### 4. Reminders behave as designed, which looked like a failure at first

A follow-up reminder did not arrive for a row due "tomorrow", and I first read that as a bug. The rule is that the reminder goes out on the follow-up date minus one day, in the plan's time zone. In Chicago, the day had already passed. After moving the date, exactly one reminder arrived, and a second run sent none. The weekly digest likewise arrived once. Checking the rule before changing the code avoided a wrong fix.

---

## The AI planner eval, with its limits

Source: `evals/results.md` (prompt v1) and `evals/results.v2.md` (prompt v2).

| Measure | Prompt v1 | Prompt v2 |
|---|---|---|
| Personas recorded | 12 of 12 | 12 of 12 |
| Valid on first try | 12 of 12 | 12 of 12 |
| Matches the answer key | 11 of 12 | 12 of 12 |
| Clean on the diff and the reply-length check | 10 of 12 | 12 of 12 |
| Invented features | 0 | 0 |

Caveats that go with every quote of these numbers:

- **Not an API measurement.** The recordings were made by Claude Code subagents on an existing Claude Code plan. No paid Anthropic API was called (ADR 0005).
- **v2 is in-sample.** I wrote the v2 prompt after seeing the v1 results on these same 12 personas, and two of its changes target the two v1 problems directly. It shows those problems are fixed. It does not show the planner generalises. A fair test needs new personas written after v2 was frozen, ideally by someone other than the prompt author.
- **One run per persona.** The results describe what one run produced, not how often the prompt succeeds.
- **The v1 answer key changed once after the first run.** A career-center label was loosened to accept the persona's own wording. The planner was not changed. This moved the v1 diff-clean count from 10 to 11.
- **Small set, same author.** The personas and the prompt came from the same person.

---

## Results against the original goals

| Goal | Status |
|---|---|
| The AI never writes code that runs in an account | Held by design. The engine is fixed code. |
| A hiring manager can try it without signing in | Met. Live Demo mode. |
| Zero cost | Met so far. Vercel Hobby, Supabase Free, no billing on Google Cloud (a human check, not yet confirmed from the console). |
| Plan validation catches bad plans | Met on 201 schema tests and the 12-persona eval. |
| Setup in under 20 minutes (G-1) | **Not measured.** It needs the connecting step that is not built. |
| Hand-built setup time, per system, and the manual step count | **TO MEASURE.** Left empty on purpose. See below. |

### Before and after times (not claimed)

| Measure | Value |
|---|---|
| Hand-built setup time, per system | **TO MEASURE** |
| Manual steps in the hand-built method (clicks, copies, formulas, triggers) | **TO MEASURE** |
| LogWizard time from interview to a working system | **TO MEASURE** (needs the connecting step) |

I built the system by hand five times (`PLAN.md` section 1) but did not record the time. I will not estimate it. If the hand-built method cannot be repeated and timed honestly, the case study should say that rather than carry a number.

---

## What is not done

- The web app does not sign a visitor in to Google or install the engine for them (`PLAN.md`, Phase 4). Everything the engine does was tested by installing it by hand.
- Not tested in real Google: a Workspace account, a second Google account using the sidebar, and the daily send-limit warning paths.
- Accessibility (WCAG 2.1 AA) has not been audited.
- The video walkthrough and a public sample sheet have not been made (`docs/demo-script.md`).
- Microsoft support is a written design only (`docs/MICROSOFT_ADAPTER.md`).

---

## What I would do differently

*Draft from the project record. Rewrite this section in your own words before publishing.*

1. **Test the real Google earlier.** The formula bug, the missing email scope and the two-account failure all surfaced only in the real-Google run. Offline tests could not have found them, and I ran that check late.
2. **Freeze the eval answer key before the first run.** The v1 key changed after a run showed a difference. A key fixed in advance is stronger evidence.
3. **Write the held-out personas first.** The v2 results are in-sample because I could not test on people the prompt had never seen. New personas written before the prompt would have given a fair test.
4. **Time the hand-built systems when I made them.** The before-time is the number a reader most wants, and it is the one I cannot supply honestly.
5. **Make the fake match the real thing as I learn it.** Each real-Google surprise should immediately update the fake and add a test, as I did for formulas, so the lesson stays in the suite.
