# Phase 0 Spikes

Each spike records: question, what was tried, result, decision.

Status key: **Done** (answered from official docs), **Partly** (docs answered part, a hands-on test is still needed), **Pending** (needs Aaron's test Google account).

Last updated: 2026-10-11.

| # | Topic | Status |
|---|---|---|
| 1 | Template copy with `drive.file` | Partly |
| 2 | Bound script comes along and runs | Pending |
| 3 | Permission prompt in testing mode | Pending |
| 4 | Identifying the submitter | Pending |
| 5 | Email limits | Done |
| 6 | Anthropic model and structured output | Done (structured output detail pending) |
| 7 | Minimal OAuth scopes | Partly |

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
