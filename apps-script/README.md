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

- `onOpen()`: builds the menu, named from the plan `system_name` ("LogWizard" if no valid plan). Items: Add entry, Run routing now, Send test reminder, Activate, Help.
- `activate()`: reads `_plan`, re-validates with `validatePlan` and refuses with a plain message on failure. Otherwise sets the spreadsheet time zone, creates Setup and Activity, builds one tab per log (headers, frozen row, plain-text format, data validation), creates or reuses one Google Form per base log, replaces its own triggers, writes a confirmation to Setup.
- `showAddEntrySidebar()`: owner sidebar generated from the fields.
- `submitEntry(payload)`: called by the sidebar via `google.script.run`. Returns `{ok, message}` or `{ok:false, errors}`.
- `onFormSubmit(e)`: form-submit trigger. Writes the row, routes, alerts.
- `runRoutingNow()`: copies any missing routed rows. Safe to repeat.
- `sendTestReminder()`: emails the owner what is due today, ignoring the send hour. Records no sent keys.
- `hourlyTick()`: hourly trigger. Due reminders and the weekly digest, merged into one email per person per day.
- `showHelp()`: plain-language help dialog.

Core functions (`src/core.ts`, unit-tested): `loadPlan`, `activate`, `addEntry`, `handleFormSubmission`, `submitEntryFromSidebar`, `runRoutingNow`, `hourlyTick`, `sendTestReminder`, `deliver` (daily cap, sent keys, 80% warning), `buildMenu`, `showSidebar`, `guarded` (any failure becomes a plain Activity line).

## Behaviour rules

- `_plan` tab: all non-empty cells in column A are joined in order, so a plan over 50,000 characters can be split across rows.
- Every write goes through `sanitizeCellValue` and a range format of `@`. Rows are read back with a leading `'` removed only when it guards `= + - @`.
- Writes and routing run inside `LockService.getDocumentLock()` (30 second wait).
- Nothing is ever deleted: an existing tab with different headings is left untouched (warning on Activity), existing forms keep their questions and responses, only missing questions are added.
- Triggers: named inventory `hourly` (`hourlyTick`) and `form_submit` (`onFormSubmit`, one per form). Activate deletes only triggers with those handler names, then recreates them.
- Sending: cap is 100 for gmail.com or googlemail.com owners, 1500 otherwise. Script properties hold `sendCount` (`{date,count}`), `sent:<YYYY-MM-DD>` key lists (older than 2 days pruned), `formId:<logId>`, `capNotice`, `activatedAt`. Activity gets one warning per day at 80% and one when emails are deferred. Failed sends are logged and retried next hour.
- Submitter: the form collects the respondent email and also asks a required "Your name" question (fallback until Spike 4 is answered). `enteredBy` is the email, else the name.

## OAuth scopes (pinned in `appsscript.json`)

```
https://www.googleapis.com/auth/spreadsheets.currentonly
https://www.googleapis.com/auth/forms
https://www.googleapis.com/auth/script.scriptapp
https://www.googleapis.com/auth/script.send_mail
https://www.googleapis.com/auth/script.container.ui
```

`forms` (not `forms.currentonly`) because the engine creates forms. Possibly needed, not added: `https://www.googleapis.com/auth/userinfo.email` (only if `Session.getActiveUser().getEmail()` returns blank for the owner; the code falls back to the plan owner email). Nothing restricted (full Gmail, full Drive) is requested.

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

## Assumptions to confirm at H2

Numbered H2 checks. The test script above refers to them as H2-n.

1. Menu items, triggers and `google.script.run` find the top-level wrapper functions in the bundled `Code.js`, and the editor lists them.
2. `Intl.DateTimeFormat` with `timeZone`, `formatToParts` and `hourCycle: "h23"` is correct in the V8 runtime (used by `zonedParts`). If not, swap in `Utilities.formatDate`.
3. `FormApp.create` works with only the `forms` scope (no Drive scope), and the new form lands in My Drive root. Read "Project OAuth Scopes" to see whether Google asks for anything else (for example `userinfo.email`).
4. `setCollectEmail(true)` makes `getRespondentEmail()` return the email in the trigger event on a personal Gmail account and on Workspace (Spike 4). Also check what `Session.getActiveUser().getEmail()` returns for the owner in the sidebar. If either is blank, the "Your name" fallback and the plan owner email are used.
5. A form-submit trigger created with `forForm(...)` by the owner at Activate runs as the owner, and a contributor submitting never sees an authorization prompt (Spike 3). Event shape: `e.response`, `e.source`; item titles equal question titles; a date answer arrives as `YYYY-MM-DD`; a checkbox answer arrives as an array.
6. In a cell formatted `@`, a value written as `'=...` either hides the leading apostrophe or shows it literally. If it shows, drop the prefix for the write (the `@` format alone then protects the cell) and keep the read-back logic. Also confirm date and number strings stay text, and that the date (REGEXMATCH formula), email and URL validations behave on text cells.
7. The manifest `timeZone` cannot be changed from code, so Activate sets only the spreadsheet time zone. Confirm the hourly trigger still fires hourly and that reminders follow the plan zone (the engine compares in the plan zone itself).
8. `LockService.getDocumentLock().waitLock(30000)` works from the sidebar call and from the form-submit trigger; two near-simultaneous form submissions both end up written once.
9. MailApp limits match Spike 5 (100 per day personal, 1500 Workspace) and the gmail.com or googlemail.com test for "personal" is right for the test account. `MailApp.sendEmail` works with only `script.send_mail`.
10. Script property values stay under 9 KB: the `sent:<date>` key list is one property per day. Fine for 20 contributors; revisit if recipients grow.
11. The simple trigger `onOpen` can read `_plan` and build the menu before the user has authorized the script. `SpreadsheetApp.getUi().alert` works from the menu and fails quietly (caught) from triggers.
12. The final "Project OAuth Scopes" list equals the five scopes in `appsscript.json` and shows no restricted scope.
13. `insertSheet`, whole-column `setNumberFormat` and `setDataValidation` over the sheet's rows are fast enough (under about 30 seconds for three tabs) with `spreadsheets.currentonly`.
14. If the owner deletes a generated form, Activate creates a new one and re-points the trigger (Setup shows the new link).
