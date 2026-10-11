# Plan Audit: LogWizard

This audit reviews the first draft of `PLAN.md`. Each finding has a severity, the problem, the fix, and where the fix landed in the revised `PLAN.md`.

Severity:
- **High** means the plan would fail or stall without the fix.
- **Medium** means quality, security, or reliability gaps.
- **Low** means portfolio polish.

Nothing has been built yet. Items marked "verify in Phase 0" are informed expectations, not confirmed facts.

## Platform decision

**Vercel, not Expo.** Expo builds mobile apps, and mobile apps are out of scope (section 11). The interview is a desktop web task, and Next.js is already the chosen framework. Vercel adds:
- preview URLs on every pull request, which Aaron can use to review each GATE
- function timeouts long enough for the AI call
- environment variable management
- bot and rate protection for the paid AI endpoint

## Findings

### High

| # | Problem | Fix | PLAN.md |
|---|---|---|---|
| 1 | With the `drive.file` scope, the app can only open files it created or that the user picked through it. Copying Aaron's shared template may be refused (verify in Phase 0). | Spike 1 now tests three options in order: (a) direct copy with `drive.file`, (b) Google Picker, so the user "picks" the template, (c) a `/copy` link, then the app hands over the plan for the user to paste. The spike records which one wins. | 8, Phase 0 |
| 2 | Each copied sheet holds a brand new script project. Every contributor who opens the sidebar would have to approve it and would see Google's "unverified app" warning. That is a bad experience for non-technical users. | Contributors add entries through a **Google Form** that the engine generates from the plan. The form-submit trigger runs as the owner, so contributors never approve anything. The sidebar stays available to the owner. | 6 |
| 3 | Hiring managers, the main audience, will not sign into an unverified Google app. Testing mode also caps the app at 100 test users. | Add a **Demo mode**: interview, AI plan, and preview, then a view-only sample sheet and a short recorded walkthrough. No Google sign-in needed. | 5, Phase 3 |
| 4 | Question 10 asks for a time zone, but the schema has no place to store it. Reminders would fire at the wrong hour. | Add `time_zone` (IANA name, e.g. `America/Chicago`). The engine sets the sheet's time zone from it. Tests cover daylight saving changes. | 4, 6 |
| 5 | The AI endpoint is public and paid, and nothing stops abuse or runaway cost. | Revision 4 removes the paid endpoint: replay mode is the default, visitors can bring their own key, and there is no server-side AI key. Input caps and a rate limit remain. Interview answers are treated as untrusted text. | 3, 3a, Phase 3 |
| 6 | Apps Script cannot import TypeScript packages, and `clasp` does not bundle code. As written, the shared `engine-logic` package would never reach the template. | Add **esbuild** (needs approval) to bundle `engine-logic` and the plan validator into one Apps Script file. The engine re-checks `_plan` at Activate with the same validator the web app uses. | 3, 6, 7 |

### Medium

| # | Problem | Fix | PLAN.md |
|---|---|---|---|
| 7 | Scopes are unpinned. `GmailApp` asks for full Gmail access, a "restricted" scope. | Use `MailApp` (send only). Pin `oauthScopes` in `appsscript.json` to the minimum list. | 6 |
| 8 | Routing rules do not name a source log, check option values, or define what happens on edits. | Add `from`. `includes` must be one of the field's options. Targets must use `copy_fields_from` the source, with no chains. Routed rows are snapshots (a documented limit). | 4 |
| 9 | Rejecting plan strings that start with `-` or `+` blocks real labels, and user-entered rows are not protected at all. | Keep the rejection for `=` and `@` plus a short list of risky leads in plan text. Also write every user-entered cell as plain text in the engine. | 4, 6 |
| 10 | Two people submitting at once could interleave writes, and re-running Activate could duplicate triggers. | Use `LockService` around writes and routing. Activate removes and reinstalls its own triggers by name. | 6 |
| 11 | Email limits are mentioned but not enforced. | The engine counts sends per day and batches one email per person per day. It logs a plain warning to `Activity` near the limit. | 6 |
| 12 | "Invents features" is a judgment call, so the eval cannot score it automatically. | Each persona file lists the features it expects. The eval diffs the plan against that list and reports cost and time per run. | 5 |

### Low

| # | Problem | Fix | PLAN.md |
|---|---|---|---|
| 13 | The case study needs measured numbers, but there is nowhere to record them. | Supabase stores **anonymous funnel metrics only**: step timings, validation results, retry counts. No emails, answers, or plans. RLS is on, and rows auto-delete after 90 days. | 3, 7, Phase 3 |
| 14 | Strong analyst artifacts are missing. | Add `docs/decisions/` (decision records), `docs/traceability.md` (requirement to story to test), and `docs/privacy.md` (also needed for the OAuth consent screen). | Phase 6 |
| 15 | Requirements are written last, and nothing proves the whole chain works until Phase 4. | Draft `requirements.md` in Phase 0. Add a **walking skeleton** (Phase 1.5): a hard-coded plan goes all the way to a working email before any interview UI exists. | 8 |
| 16 | No accessibility target is stated. | WCAG 2.1 AA for the web app. | Phase 6 |

## Also added

- **Revision 4:** a zero-cost rule (section 3a). Replay mode, free plans only, no billing accounts, a cost guard at every gate. Vercel BotID and the Anthropic spend cap were dropped because there is no paid endpoint left to protect.
- **Revision 3:** the plan now runs as an autonomous multi-agent OMC team (section 9a), with automated gates, stop conditions, and a short list of human-only steps (section 9b) for accounts, keys, and Google permission prompts.
- Phase-by-phase **oh-my-claudecode** workflow (section 9a).
- A short **risk register** (section 12).
