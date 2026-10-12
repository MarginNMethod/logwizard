# Phase 0 Spikes

Each spike records: question, what was tried, result, decision.

Status key: **Done** (answered from official docs), **Partly** (docs answered part, a hands-on test is still needed), **Pending** (needs Aaron's test Google account).

Last updated: 2026-10-11.

| # | Topic | Status |
|---|---|---|
| 1 | Template copy with `drive.file` | Partly |
| 2 | Bound script comes along and runs | Partly (script created bound to a sheet via clasp, runs; copy-by-app not tested) |
| 3 | Permission prompt in testing mode | Partly (owner prompt seen; list not read; contributor path done) |
| 4 | Identifying the submitter | Partly (personal accounts only; Workspace not tested) |
| 5 | Email limits | Done |
| 6 | Anthropic model and structured output | Done (structured output detail pending) |
| 7 | Minimal OAuth scopes | Done for the engine's own functions (five scopes were enough) |

---

## Spike 1: Template copy with `drive.file`

**Question.** Can the app copy a template spreadsheet, with its bound script, into the user's Drive using the narrow `drive.file` scope?

**What was tried.** Read the Drive API scope guide (https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

**Result (docs only).**
- `drive.file` is a non-sensitive scope that gives per-file access: files the app creates, or files the user opens with the app or shares with it through the Google Picker.
- The page does not mention `files.copy`. The reasonable reading is that `files.copy` works only on a file the user has provided to the app. A template owned by Aaron that the app has never been given access to is probably not copyable.

**Decision (provisional).** Test three methods in a test account, in this order, and use the first that works:
1. (a) `files.copy` with `drive.file` on the template, with no extra step.
2. (b) The Google Picker, so the user selects the template and grants `drive.file` access to it, then `files.copy`.
3. (c) Fallback: the app shows a "Make a copy" link and the plan, and the user pastes the plan into `_plan`.

**Still to do.** Hands-on test of (a), (b), (c). Record which works, and whether the bound script is included in the copy (that is Spike 2).

---

## Spike 2: Bound script comes along and runs after Activate

**Status.** Pending. Needs the test Google account and a template sheet with a bound script.

**To test.**
- Copy the template by the method from Spike 1.
- Confirm the script is present in the copy.
- Click the menu item "Activate" and confirm the permission prompt appears, triggers are installed, and `Setup` shows a confirmation.
- Decide whether the app writes the plan into `_plan` or the script fetches it.

---

## Spike 3: Permission prompt for an unverified app in testing mode

**Status.** Pending. Needs the OAuth consent screen (Aaron's checklist).

**To test and record.** What the prompt looks like, how many test users are allowed, and whether the Form-based contributor path avoids the prompt entirely, as the plan expects.

---

## Spike 4: Identifying who submitted an entry

**Status.** Pending.

**To test.** On a personal Gmail account and a Workspace account: does the Form's collected email reach the `onFormSubmit` event, and what does `Session.getActiveUser()` return? Fallback if either is unreliable: a required "Your name" question on the Form.

---

## Spike 5: Email limits

**Question.** What are the current daily sending limits for personal and Workspace accounts?

**What was tried.** Read the Apps Script quotas page (https://developers.google.com/apps-script/guides/services/quotas).

**Result.**
- Email recipients per day: **100** for consumer accounts (gmail.com), **1,500** for Google Workspace accounts.
- Total trigger runtime: 90 minutes per day (consumer), 6 hours per day (Workspace).
- Triggers per user per script: 20 for both.

**Decision.** The engine counts recipients sent per day, batches one email per person per day, and writes a plain warning to `Activity` when it reaches about 80% of the daily cap. The engine keeps its own triggers well under 20 (planned: one daily, one weekly, one form-submit).

**Caveat.** Quotas change. Re-check this page at Phase 2 and Phase 4.

---

## Spike 6: Anthropic model name and structured output

**Question.** What is the current model name, and how do we get JSON back reliably?

**What was tried.** Read the models overview (https://platform.claude.com/docs/en/about-claude/models/overview).

**Result.**
- Current API IDs: `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`.
- `claude-sonnet-5-5` is described as the best mix of speed and intelligence, at $2 per million input tokens and $10 per million output tokens. All current models support tool use.
- API pricing is listed for reference only. Under the zero-cost rule (`PLAN.md` section 3a) the project makes no paid API calls: replay mode is the default and visitors may bring their own key.

**Decision.** For bring-your-own-key mode, default `ANTHROPIC_MODEL=claude-sonnet-5-5`, read from the environment so it can be changed without code edits. The default path needs no key at all.

**Still to do.** Confirm the structured output approach (tool use with the Zod schema converted to JSON Schema, versus a dedicated structured output feature) when building Phase 3. Not needed before Gate 0.

---

## Spike 7: Minimal OAuth scopes for the engine

**Question.** Which scopes does the engine need, and are any restricted?

**What was tried.** Read the Apps Script scopes guide (https://developers.google.com/apps-script/concepts/scopes).

**Result.**
- Confirmed on the page: `https://www.googleapis.com/auth/forms.currentonly` and `https://www.googleapis.com/auth/script.scriptapp` (needed to create triggers).
- Not confirmed on that page: `spreadsheets.currentonly`, `script.send_mail`, `script.container.ui`. They are expected to be correct but are not verified here.
- The page does not say which scopes are sensitive or restricted.

**Decision (provisional).** Draft `oauthScopes` in `appsscript.json` with the five scopes in `PLAN.md` section 6. Run the script once in the test account and read the "Project OAuth Scopes" list on the Overview page to see what Apps Script actually requests, then compare with Google's sensitive and restricted scope lists.

**Still to do.** Hands-on check as described.

---

## Summary for Gate 0

- **Answered:** 5 (email limits) and 6 (model).
- **Partly answered:** 1 (copy method) and 7 (scopes). Both have a clear next test.
- **Blocked on Aaron:** 2, 3, 4. They need the test Google account and OAuth consent screen from the checklist in `PLAN.md` section 10.
- **One design risk to watch:** if methods (a) and (b) in Spike 1 both fail, the real Google build falls back to a "Make a copy" link plus pasted plan. Demo mode is unaffected.


---

## Hands-on results (H2 session, 2026-10-12)

Run in two personal Google accounts: an "owner" account and a second "contributor" account. The engine was pushed with `clasp` to a script bound to a new test spreadsheet. Offline unit tests use fakes; these are the first results from real Google.

**Worked as designed**
- **Bundle and menu.** The one-file bundle loaded. The custom menu was named from the plan and had all five items. `onOpen` built it by reading `_plan` (H2 check 1).
- **Scopes.** The five pinned scopes were enough for everything run: Activate, Form creation, trigger install, form-submit handling, routing, and sending the test email. No extra scope was asked for. The Apps Script API setting must be on for the account that runs `clasp` (it is per account).
- **Activate.** It created the `Activity`, `Setup`, `All Employers` and `Education Log` tabs, headers, choice dropdowns, one Google Form and 2 triggers, and wrote the form link to `Setup`. Its confirmation dialog appeared.
- **Form submit as owner.** The form-submit trigger wrote a row, normalised the date to `YYYY-MM-DD` text, joined the multi-choice area as `Education, Arts`, and routed a copy to `Education Log` with the same entry ID.
- **Contributor path (Spike 3).** The second account opened and submitted the form with **no authorization prompt**, and the row was written by the owner's trigger.
- **Submitter identity (Spike 4, personal accounts).** The form shows a checkbox to record the signed-in email. With it ticked, `Entered by` held the account's email for both the owner and the contributor, with no `(unverified)` flag. A required "Your name" question is also shown.
- **Test reminder (Spike 5, partly).** `Send test reminder` sent an email to the owner with only the `send_mail` scope. The daily limit shown on `Setup` was 100 for a gmail.com owner.

**Not tested yet**
- The sidebar (Add entry), the hourly check running on its own, a real follow-up reminder, and the weekly digest.
- Whether the owner alert email for the contributor entry arrived. The Activity tab does not log successful alerts; the owner should check the inbox.
- Cells beginning with `=` or `-` written as plain text (H2 checks 6, 18), and the "- Other -" option under list validation.
- The exact permission list Google showed on the first run, and the unverified-app wording.
- A Workspace account, and `Session.getActiveUser()` behaviour.
- Re-running Activate (idempotence) against real Google.

**Surprises**
- The first-run authorization appeared when the script was run from the editor, before the menu was used.
- A helper that opens an alert from the editor fails (`getUi` only works from the sheet). It only affected the test helper.
- Google Forms on personal accounts used a "Record email" checkbox, not the verified collection mode the code asks for. The code's fallback and the unverified logic did not trigger. Workspace behaviour is unknown.

**Follow-up: formula injection (found and fixed, same day)**
- **Finding.** A form answer of `=SUM(A1)` in Organization was evaluated by Google and showed `0`, even in a plain-text formatted column. The first fix (text format only) was unsafe.
- **Fix.** Every data cell starting with `=`, `+`, `-` or `@` now gets a leading apostrophe, except a value that is exactly a list option. Reading strips it. 15 new tests, 67 in the Apps Script package.
- **Re-test in real Google.** After `clasp push`, the same `=SUM(A1)` through the form was stored as text. The cell shows `=SUM(A1)` and the formula bar shows `'=SUM(A1)`. No visible apostrophe in the cell. Passed.
- **Still open.** Real-Google behaviour for `+`, `-` and `@` starts, and the hourly reminder and weekly digest sends.
