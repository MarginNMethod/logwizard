# apps-script: the LogWizard engine

TypeScript source for the Google Apps Script engine that lives inside the template spreadsheet. All decisions come from `@logwizard/engine-logic` and `@logwizard/plan-schema`. Google calls sit behind the `Services` interface (`src/services.ts`), with one real implementation (`src/google.ts`) and an in-memory fake for tests (`test/fakeServices.ts`).

Layout:

| File | Role |
|---|---|
| `src/index.ts` | Entry points Apps Script can call |
| `src/core.ts` | Glue: activate, add entry, routing, reminders, sending, menu |
| `src/google.ts` | The only file that uses SpreadsheetApp, FormApp, MailApp, PropertiesService, LockService, ScriptApp, Utilities, HtmlService |
| `src/services.ts` | The `Services` interface and shared types |
| `src/mail.ts`, `src/sidebar.ts` | Email text, sidebar HTML (all plan text escaped) |
| `build.mjs`, `check.mjs` | esbuild bundle to one `dist/Code.js`, then post-build checks |
| `appsscript.json` | Pinned manifest, copied to `dist/` |

## Commands (safe, offline)

```
pnpm --filter @logwizard/apps-script test        # vitest, fake Services
pnpm --filter @logwizard/apps-script typecheck
pnpm --filter @logwizard/apps-script build       # dist/Code.js + dist/appsscript.json, then check.mjs
```

`check.mjs` fails the build if `dist/Code.js` has `import`, `export` or `require(`, if an entry point is missing as a top-level function, or if the manifest has a scope outside the allowed list. It prints the bundle size and whether zod is bundled (it is: `validatePlan` uses zod; about 212 KB unminified, about 113 KB minified).

## Functions

Entry points (top-level in `dist/Code.js`):

- `onOpen()`: builds the menu, named from the plan `system_name` ("LogWizard" if no valid plan). With a plan, items: Add entry, Run routing now, Send test reminder, Replace plan, Activate, Help. With no valid plan (no `_plan` tab, or it is empty or invalid), only Paste your plan and Help.
- `showPastePlanDialog()`: the Paste your plan and Replace plan menu items. Opens a modal dialog with instructions, a large text box and a Save button.
- `savePlanFromDialog(text)`: called by the dialog via `google.script.run`. Never throws. Accepts the bare plan, the planner reply `{plan, ...}` or the downloaded plan file. Validates with the same `validatePlan` as Activate and writes nothing on failure. On success it sets `owner.email` to the person pasting (when Google reports an address), writes the plan to the hidden `_plan` tab in chunks, and logs one Activity line. Returns `{ok, message, errors?}`.
- `activate()`: reads `_plan`, re-validates with `validatePlan` and refuses with a plain message on failure. Otherwise sets the spreadsheet time zone, creates Setup and Activity, builds one tab per log (headers, frozen row, plain-text format, data validation), creates or reuses one Google Form per base log, replaces its own triggers, writes a confirmation to Setup.
- `showAddEntrySidebar()`: owner sidebar generated from the fields.
- `submitEntry(payload)`: called by the sidebar via `google.script.run`. Returns `{ok, message}` or `{ok:false, errors}`.
- `onFormSubmit(e)`: form-submit trigger. Writes the row, routes, alerts.
- `runRoutingNow()`: copies any missing routed rows. Safe to repeat.
- `sendTestReminder()`: emails the owner what is due today, ignoring the send hour. Records no sent keys.
- `hourlyTick()`: hourly trigger. Due reminders and the weekly digest, merged into one email per person per day.
- `showHelp()`: plain-language help dialog.

Core functions (`src/core.ts`, unit-tested): `loadPlan`, `activate`, `addEntry`, `handleFormSubmission`, `submitEntryFromSidebar`, `runRoutingNow`, `hourlyTick`, `sendTestReminder`, `savePlanFromPaste`, `showPasteDialog`, `deliver` (daily cap, sent keys, 80% warning), `buildMenu`, `showSidebar`, `guarded` (any failure becomes a plain Activity line).

## Behaviour rules

- `_plan` tab: all non-empty cells in column A are joined in order, so a plan over 50,000 characters can be split across rows.
- Text cells (Q2): log tabs are written with the range format `@` set BEFORE the values, and no apostrophe prefix is added there (the format alone keeps `=SUM(A1)` inert, and a strictly list-validated cell accepts `- Other -`). `sanitizeCellValue` (apostrophe prefix) is still used for Setup and Activity. Rows are read back as written. Known edge: the engine strips a leading `'` in front of `= + - @` when copying routed rows, so a literal value like `'=x` loses its apostrophe.
- Columns are read and written by heading name, not position. A hand-reordered tab or extra columns to the right keep working. If a tab lacks a heading the plan expects, nothing is written to or read from it (a plain warning on Activity, once per day for the hourly check).
- Re-activate after a plan edit (A1): if the tab headings equal the plan, or the plan only appended fields at the end, the missing heading cells are added at the end and nothing else changes. Any other difference (inserted, renamed or removed field) stops that log: no form questions, no form trigger, a Setup "Problem" row, and an Activity message saying exactly what differs and to rename the old tab and Activate again. The rest of the system is untouched.
- Locking (A2, A10): everything uses `LockService.getScriptLock()` (10 second wait, three attempts). Activate holds it for the form and trigger section. Writes and routing hold it only while reading and writing the sheet. `hourlyTick` holds it to work out and reserve what to send, releases it, sends, and only takes it again to give back a failed send. Mail is never sent while the lock is held.
- Catch-up (A2): each hourly check re-imports form responses (newer than the first activation and at most 7 days old) whose deterministic entry id is not in the log yet. Safe to repeat. `importFrom` script property holds the first activation time.
- Sending (A3, A5, A6): the daily count and the sent keys are reserved under the lock before sending, then a failed send gives its slot and key back. Alerts, the test reminder, reminders and digests all use this one accounting. Ceiling = min(plan cap, `MailApp.getRemainingDailyQuota()` + sent today). Alerts may use at most half the ceiling and 10 per hour (`alertDay`, `alertHour` properties), so reminders and digests keep room; dropped alerts are logged once a day and the entries are still saved.
- Submitter (A4, Q3): the sidebar user is whatever `Session.getActiveUser().getEmail()` returns. If blank it is recorded as `unknown` (never assumed to be the owner), so alerts still fire. Forms are set to VERIFIED email collection on every activation. Only an email from a form recorded as verified (`verified:<formId>` = 1) can identify anyone, above all the owner. Otherwise the email is stored as `<email> (unverified)` and the alert path runs as for an unknown person.
- Contributor-typed text (A11, A12): the name is stripped of control characters, put on one line and cut at 80 characters. It is kept out of the email subject and quoted in the body. The built-in name question is titled "Your name", or "Your name (contributor)" (then "(contributor 2)" and so on) if a plan field already has that label.
- Form refresh (A7): every activation updates required flags and choices of existing questions to match the plan (listed on Activity).
- Dates (A8): date cells are normalised on read (`3/2/2026` is read as 2026-03-02). A date that cannot be read is ignored and one warning per log per day goes to Activity.
- Busy lock (A9): only the message text "Lock timeout" is treated as busy. From a trigger the Activity line says the run was skipped and what will pick it up.
- Sidebar (A13): every label has `for` and every control an `id`, multi-choice is a fieldset with a legend, required fields show "* required" and carry `aria-required`.
- Nothing is ever deleted: existing forms keep their questions and responses, only missing questions are added (and existing ones refreshed as above).
- Triggers: named inventory `hourly` (`hourlyTick`) and `form_submit` (`onFormSubmit`, one per form). Activate deletes only triggers with those handler names, then recreates them.
- Sending: plan cap is 100 for gmail.com or googlemail.com owners, 1500 otherwise, lowered to what MailApp says is left. Script properties hold `sendCount` (`{date,count}`), `sent:<YYYY-MM-DD>` key lists (older than 2 days pruned), `formId:<logId>`, `capNotice`, `activatedAt`. Activity gets one warning per day at 80% and one when emails are deferred. Failed sends are logged and retried next hour.
- Submitter: the form collects the respondent email and also asks a required "Your name" question (fallback until Spike 4 is answered). `enteredBy` is the email, else the name.

## OAuth scopes (pinned in `appsscript.json`)

```
https://www.googleapis.com/auth/spreadsheets.currentonly
https://www.googleapis.com/auth/forms
https://www.googleapis.com/auth/script.scriptapp
https://www.googleapis.com/auth/script.send_mail
https://www.googleapis.com/auth/script.container.ui
https://www.googleapis.com/auth/userinfo.email
```

`forms` (not `forms.currentonly`) because the engine creates forms. `userinfo.email` (non-sensitive) was added after the second H2 run: without it `Session.getActiveUser().getEmail()` was blank and the owner's own sidebar entries were recorded as `unknown`. If it is still blank the entry is recorded as `unknown` (the code does not fall back to the owner, so a collaborator is never mistaken for the owner). Re-test: see check 23. Nothing restricted (full Gmail, full Drive) is requested.

## Human-only: clasp (do NOT run from an agent session)

These touch a Google account. Run them yourself at step H2, with the TEST account.

```
cd apps-script
pnpm build
cp .clasp.json.example .clasp.json          # then put the real script id in .clasp.json
pnpm exec clasp login                        # human, browser sign-in
# Either create a new bound script on an existing test spreadsheet (use its ID from the sheet URL):
pnpm exec clasp create --type sheets --parentId <SPREADSHEET_ID> --title "LogWizard engine" --rootDir dist
# or, if you made the project in the browser, put its script id in .clasp.json and skip create.
pnpm exec clasp push --force                 # uploads dist/Code.js and dist/appsscript.json
pnpm exec clasp open-script                  # opens the editor
```

`.clasp.json` holds a real script id: never commit it. `.claspignore` limits the upload to `Code.js` and `appsscript.json`.

## Manual H2 test script (test account, sample plan)

Setup: new spreadsheet in the test account. Add a tab named `_plan` (hide it later). Paste the PLAN.md section 4 example JSON into cell A1 (use `owner@example.com` replaced by the test account's real address as owner, and a second real address you can read as the contributor). Push the code (above) and reload the sheet.

1. Reload the sheet. Expected: a menu named "Employer Outreach Log" with Add entry, Run routing now, Send test reminder, Activate, Help. (H2-1, 11)
2. Menu, Help. Expected: a dialog with the help text.
3. Menu, Activate. Expected: Google's permission prompt (note the screen and the scope list for Spike 3 and 7), approve. Then a dialog "Activated. See the Setup tab...". Tabs now: All Employers, Education Log, Setup, Activity (plus `_plan`). Header row bold, frozen. Setup lists the form link, time zone and trigger count 2. Project, Triggers page shows exactly one hourly time trigger and one form-submit trigger. The spreadsheet time zone is America/Chicago. (H2-2, 3, 4)
4. Activate again. Expected: same tabs, still exactly 2 triggers, the same form link, one new Activity line, no new forms in Drive. (H2-5)
5. Menu, Add entry. Fill Organization `Acme`, Interaction type `Email`, Date `2026-03-01`, Area tick Education, Follow-up date tomorrow. Save. Expected: green "Saved to All Employers and copied to Education Log." One row in each tab, Entry ID equal in both. No email (you are the owner).
6. Add an entry with Organization `=HYPERLINK("http://example.com","x")`. Expected: shows as literal text, not a link, in both tabs. (H2-6)
7. Open the form link from Setup in a second browser profile signed in as the contributor. Submit one entry with Area Education. Expected: row appears in both tabs with the contributor email in "Entered by"; the owner gets one alert email; Activity has an info line. If "Entered by" shows the name instead of the email, record that for Spike 4. (H2-7, 8)
8. Menu, Run routing now. Expected: "0 row(s) copied". Delete the Education Log data row by hand, run again: "1 row(s) copied", no duplicates, run a third time: 0. (H2-9)
9. Menu, Send test reminder. Expected: one email to the owner starting "[Test]". (H2-10)
10. Set a row's Follow-up date to tomorrow, wait for the next hour tick (or run `hourlyTick` from the editor after 08:00 local). Expected: one email "your summary for <date>". Run `hourlyTick` again: no second email. Script properties show `sent:<date>` and `sendCount`. (H2-11, 12)
11. In the editor, set the `sendCount` property to `{"date":"<today>","count":80}` and run `hourlyTick` after creating a due item. Expected: the email goes and Activity gets "80% or more". Set count to 100 on a gmail.com owner: no email, Activity says the limit was reached.
12. Break `_plan` (change `time_zone` to `Mars/Olympus`) and run Activate. Expected: a message naming time_zone, nothing changed. Restore it.
13. Copy link and paste flow (C1). Open `https://docs.google.com/spreadsheets/d/<template id>/copy` signed in as a second Google account and press Make a copy (Google says the attached Apps Script is copied too). Reload the copy. Expected: a menu named "LogWizard" with only Paste your plan and Help, and no `_plan` tab content. Menu, Paste your plan, approve the permission screen. Paste the plan JSON from the web app's Copy your plan button, press Save. Expected: green "Plan saved..." that names your own email as the owner. Reload. Expected: the menu is now named from the plan and has Replace plan before Activate. The `_plan` tab is hidden. Activity has one "Plan saved" line. Then: paste "hello" and Save, expected a red plain message and no change; paste a plan with `time_zone` set to `Mars/Olympus`, expected a red message naming time_zone and the old plan still in place; Replace plan with a valid plan, expected it saved; Activate, expected the normal build.

## Assumptions to confirm at H2

Numbered H2 checks. The test script above refers to them as H2-n.

1. Menu items, triggers and `google.script.run` find the top-level wrapper functions in the bundled `Code.js`, and the editor lists them.
2. `Intl.DateTimeFormat` with `timeZone`, `formatToParts` and `hourCycle: "h23"` is correct in the V8 runtime (used by `zonedParts`). If not, swap in `Utilities.formatDate`.
3. `FormApp.create` works with only the `forms` scope (no Drive scope), and the new form lands in My Drive root. Read "Project OAuth Scopes" to see whether Google asks for anything else (for example `userinfo.email`).
4. `setCollectEmail(true)` makes `getRespondentEmail()` return the email in the trigger event on a personal Gmail account and on Workspace (Spike 4). Also check what `Session.getActiveUser().getEmail()` returns for the owner in the sidebar. If the sidebar user is blank the entry is recorded as `unknown` (no owner fallback). If the respondent email is blank the name question is the fallback.
5. A form-submit trigger created with `forForm(...)` by the owner at Activate runs as the owner, and a contributor submitting never sees an authorization prompt (Spike 3). Event shape: `e.response`, `e.source`; item titles equal question titles; a date answer arrives as `YYYY-MM-DD`; a checkbox answer arrives as an array.
6. Superseded by check 22 (the apostrophe protection is back, with an exception for list options). Still confirm date and number strings stay text, and that the date (REGEXMATCH formula), email and URL validations behave on text cells.
7. The manifest `timeZone` cannot be changed from code, so Activate sets only the spreadsheet time zone. Confirm the hourly trigger still fires hourly and that reminders follow the plan zone (the engine compares in the plan zone itself).
8. Superseded by check 15 (script lock, not document lock).
9. MailApp limits match Spike 5 (100 per day personal, 1500 Workspace) and the gmail.com or googlemail.com test for "personal" is right for the test account. `MailApp.sendEmail` works with only `script.send_mail`.
10. Script property values stay under 9 KB: the `sent:<date>` key list is one property per day. Fine for 20 contributors; revisit if recipients grow.
11. The simple trigger `onOpen` can read `_plan` and build the menu before the user has authorized the script. `SpreadsheetApp.getUi().alert` works from the menu and fails quietly (caught) from triggers.
12. The final "Project OAuth Scopes" list equals the six scopes in `appsscript.json` and shows no restricted scope.
13. `insertSheet`, whole-column `setNumberFormat` and `setDataValidation` over the sheet's rows are fast enough (under about 30 seconds for three tabs) with `spreadsheets.currentonly`.
14. If the owner deletes a generated form, Activate creates a new one and re-points the trigger (Setup shows the new link).
15. Script lock from triggers: `LockService.getScriptLock().waitLock(10000)` works from the form-submit trigger, the hourly trigger and the sidebar call. Submit two forms at once and while an hourly send is running (add a few seconds of sleep in a test copy if needed): both rows are written once and nothing is lost.
16. VERIFIED collection: `form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED)` exists in the runtime. Activate must NOT log the warning "could not be set to verified email collection". Then submit as the contributor: `getRespondentEmail()` returns their Google address. If the call is missing, the engine treats form emails as unverified and the owner is alerted about every entry; record that for Spike 4.
17. Quota call: `MailApp.getRemainingDailyQuota()` works with only `script.send_mail` and its number matches the account (about 100 personal, 1500 Workspace). Send one test mail and see it drop by one.
18. SUPERSEDED by check 22 (the original H2 run proved this approach unsafe). Old text: apostrophe behaviour (Q2): in a column formatted `@`, write `=SUM(A1)` and `- Other -` through the engine. Both display exactly as typed, no apostrophe, and `=SUM(A1)` is text. A choice column with strict list validation accepts `- Other -` (no red triangle). Also read them back with Run routing now (the copy matches).
19. Catch-up import: submit a form, delete its row from the log, wait for (or run) `hourlyTick`: the row returns once, with one alert. Run again: no second row. Check `getResponses(afterDate)` returns the responses after the given time.
20. A plan edit that appends a field: Activate adds the heading at the end of every affected tab and the question to the form. A plan edit that inserts a field in the middle: Activate leaves the tab alone and Activity explains; a form submission is refused instead of landing in the wrong column.
21. Form item refresh: change a choice list and a required flag in the plan, Activate, and the live form shows the new choices and flag. Existing responses are untouched.
22. Formula protection (replaces check 18). The first H2 run proved that writing `=SUM(A1)` with `setValues` into an `@` formatted cell is EVALUATED by Google, so the earlier "format alone protects" approach is unsafe. Now every data cell whose first non-space character is `=`, `+`, `-` or `@` (or that starts with a tab or CR) is written with one leading apostrophe, except a value that is exactly one of the options of a strict list column (choice, yes_no). Re-test in real Google with the TEST account: (a) submit Organization `=SUM(A1)` through the form and the sidebar: the cell must stay text (no 0, the formula bar must not show a formula) in the log tab and in the routed copy; (b) submit a choice answer `- Other -` (plan option): it is stored without an apostrophe, shows as `- Other -` and passes strict list validation (no red triangle); (c) put `- Other -` in a free-text column: it is stored as text with the apostrophe; (d) Run routing now after deleting a copy row: the copy matches the original, with one apostrophe and not two. Record whether the apostrophe is visible in the cell in `@` formatted cells. Expected: it may be visible there (Google keeps it as part of the text), and that is acceptable; confirm. Also confirm `getValues` returns the apostrophe so the engine strips exactly one when reading.
23. Sidebar identity. After `clasp push`, the first run asks for one more permission (see your primary Google Account email address). Save an entry from the sidebar as the owner, in a private window signed in to ONE account: `Entered by` must show the owner's email (not `unknown`) and no new-entry alert email should arrive for it. Then add a second Google account as an editor and save an entry as that person: `Entered by` shows their email and the owner gets the alert.
