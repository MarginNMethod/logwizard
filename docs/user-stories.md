# User stories

Status: draft, 2026-10-11. Requirement IDs (R-1 to R-14, N-1 to N-7) come from `docs/requirements.md`. The story-to-requirement map is repeated in `docs/traceability.md`.

Three roles, from `docs/requirements.md`:

- **Owner (O).** Non-technical. Runs a program or small team, and owns the log.
- **Contributor (C).** Adds entries. Needs no training and no technical steps.
- **Reviewer (V).** A hiring manager with a few minutes and no wish to sign in to anything.

Each story has acceptance criteria (AC). A story is done when every AC box can be ticked during a test run.

---

## Owner stories

### O-1: Answer the interview in under ten minutes
**Story.** As an owner, I want to answer a short set of plain questions, so that I can describe my tracking needs without technical terms.
**Requirements:** R-1

- [ ] The interview asks the ten topics listed in `PLAN.md` section 5, in order.
- [ ] Each question has a short example answer and a plain-language hint.
- [ ] Each free-text answer has a length limit that is shown on screen.
- [ ] A timed run from the first question to the preview takes under 10 minutes.
- [ ] The time zone is pre-filled from the browser and can be changed.

### O-2: Get a valid plan from my answers, with one safe retry
**Story.** As an owner, I want the app to turn my answers into a setup plan, so that I do not have to design the log myself.
**Requirements:** R-2, R-3

- [ ] The AI reply is accepted only if it passes the schema and every limit in `PLAN.md` section 4.
- [ ] If the plan fails validation, the app sends the errors back once. A second failure shows a friendly message, not a raw error.
- [ ] The AI asks at most two follow-up questions in total.
- [ ] Every rule in section 4 has a test with a passing and a failing example.

### O-3: Review the plan in plain English and edit it before approving
**Story.** As an owner, I want to read my plan as sentences and change it, so that I approve only what I meant.
**Requirements:** R-4

- [ ] The preview is written in plain English, without any AI call.
- [ ] The preview says reminder times in words, for example "every Monday at 8 am, Central time."
- [ ] I can edit log fields, options, and reminders in the preview.
- [ ] The app does not build anything until I click approve.

### O-4: Download the plan as a file
**Story.** As an owner, I want a copy of the plan as a JSON file, so that I can keep it or reuse it.
**Requirements:** R-5

- [ ] A download button saves the approved plan as a `.json` file.
- [ ] The file validates against the same schema when read back.

### O-5: Get a sheet in my Drive with the plan written in
**Story.** As an owner, I want the app to create my log sheet in my Google Drive, so that my data stays in my account.
**Requirements:** R-7, N-3

- [ ] After approval, a copy of the template appears in my Drive, named after the system.
- [ ] The plan is written into the hidden `_plan` tab.
- [ ] The sheet is shared with contributors only if I tick the box that allows it.
- [ ] The app asks for the narrowest permissions that work, with no restricted scopes.
- [ ] A success page shows the sheet link and three plain steps: open it, click the menu, click Activate.

### O-6: Get one tab per log, with dropdowns and date checks
**Story.** As an owner, I want each log to have its own tab with the right input rules, so that entries are clean from the start.
**Requirements:** R-8

- [ ] Each log in the plan becomes one tab with a header row.
- [ ] Choice fields show dropdowns with the listed options.
- [ ] Date fields reject values that are not dates.
- [ ] The header row is frozen and readable.

### O-7: Add entries myself from the sidebar
**Story.** As an owner, I want a sidebar form, so that I can add entries without typing into the sheet directly.
**Requirements:** R-9

- [ ] The sidebar shows one input per field in the plan.
- [ ] A submitted entry is written to its log, routed, and checked for alerts, the same as a contributor's entry.

### O-8: See entries routed to the right logs, with no duplicates
**Story.** As an owner, I want an entry that belongs to two areas to appear in both logs, so that each area sees its own work.
**Requirements:** R-10

- [ ] An entry that matches a routing rule is copied to the target log once.
- [ ] Running "Run routing now" twice creates no second copy.
- [ ] The routed copy is a snapshot. The sheet notes that later edits to the original do not update the copy.

### O-9: Get follow-up reminders on time
**Story.** As an owner, I want an email before a follow-up is due, so that nothing slips.
**Requirements:** R-11

- [ ] A daily check finds follow-up dates that are due within the number of days I chose.
- [ ] I get one reminder email per day, not one per entry.
- [ ] The reminder time is correct in my time zone, including daylight saving changes.
- [ ] "Send test reminder" sends one email.
- [ ] The weekly digest is optional and off unless I chose it.

### O-10: Get an alert when a contributor adds an entry
**Story.** As an owner, I want an email when someone else adds an entry, so that I can follow what my team is doing.
**Requirements:** R-12

- [ ] Submitting an entry as someone other than the owner sends one alert email to the owner.
- [ ] The alert names the submitter, using the Form's collected email or the "Your name" question as the fallback.
- [ ] The owner's own entries do not trigger an alert.

### O-11: Run Activate again without creating duplicates or losing data
**Story.** As an owner, I want to click Activate more than once safely, so that a mistake does not break my log.
**Requirements:** R-13

- [ ] Activate removes its own old triggers before it installs new ones.
- [ ] After a second run, the trigger list is the same as after the first.
- [ ] No row or tab is deleted by Activate.
- [ ] Setup writes a confirmation to the `Setup` tab.

### O-12: See problems in plain language
**Story.** As an owner, I want errors explained in words I understand, so that I know what to do next.
**Requirements:** R-14

- [ ] Errors are written to an `Activity` tab in plain language.
- [ ] The app shows the same kind of message on its own pages.
- [ ] No message shows a code stack, a raw API name, or a secret.

### O-13: Get a warning before I hit the email limit
**Story.** As an owner, I want to know when I am near my daily email limit, so that I do not miss reminders.
**Requirements:** N-6

- [ ] The engine counts recipients sent each day.
- [ ] One email per person per day is the batching rule.
- [ ] At about 80 percent of the daily cap, a plain warning is written to `Activity`.

### O-14: Run the system at no cost
**Story.** As an owner, I want the whole system to cost nothing, so that I can try it without a bill.
**Requirements:** N-4

- [ ] The app uses only free plans and no billing account.
- [ ] No AI key is needed to run the default path.

### O-15: Keep my data in my own account
**Story.** As an owner, I want my log and entries to stay in my Google account, so that the project does not hold my records.
**Requirements:** N-1

- [ ] The server stores only the anonymous metrics and rate-limit counters listed in `docs/privacy.md`.
- [ ] Row Level Security is on, and rows older than 90 days are deleted.
- [ ] No emails, answers, plans, or sheet links appear in the database (checked with a query).

---

## Contributor stories

### C-1: Add an entry through a Google Form, with no approval step
**Story.** As a contributor, I want to add an entry through a simple form, so that I do not have to learn the sheet.
**Requirements:** R-9

- [ ] The Form has one question for each field in the plan.
- [ ] Submitting the Form does not ask me to approve anything or sign in to a new app.
- [ ] My entry appears in the right log, and any routing applies to it.

### C-2: Have my entry saved exactly as I typed it
**Story.** As a contributor, I want my text saved as text, so that a value such as a formula does not run.
**Requirements:** N-2

- [ ] An entry that starts with `=` is stored as plain text and is not calculated.
- [ ] Every user-entered cell is written as plain text by the engine.
- [ ] AI output is validated before the app uses it.

### C-3: See my name on the entries I add
**Story.** As a contributor, I want my name recorded with my entry, so that the owner knows who added it.
**Requirements:** R-12

- [ ] The alert or the entry shows the submitter's name or email.
- [ ] If the Form does not supply an email, the required "Your name" question fills in the name.
- [ ] Spike 4 in `SPIKES.md` decides which method is used. Until then, the fallback applies.

---

## Reviewer stories

### V-1: Try the whole flow without signing in to Google
**Story.** As a reviewer, I want to see the wizard work without a Google sign-in, so that I can judge it in a few minutes.
**Requirements:** R-6, R-4

- [ ] Demo mode runs the interview, plan, validation, and preview with no Google sign-in.
- [ ] Demo mode uses the recorded replay plans by default.
- [ ] The flow ends at a view-only sample sheet and a link to a short recorded walkthrough.

### V-2: Confirm the AI cannot produce code that runs in an account
**Story.** As a reviewer, I want proof that the AI only produces a plan, so that I can trust the design.
**Requirements:** N-2, R-3

- [ ] The architecture document and the schema state that the AI output is data only.
- [ ] A test shows that a plan with a formula, script, or code-like text is rejected.
- [ ] The validator rejects strings that start with `=` or `@`.

### V-3: Read honest eval results
**Story.** As a reviewer, I want to see how the AI evaluation was produced, so that I can judge the numbers fairly.
**Requirements:** N-7, R-2

- [ ] The eval results say how each recording was produced (through Claude Code subagents, not the paid API).
- [ ] Pass criteria are checked by an automatic diff, not by judgment.
- [ ] The results show the number of plans that passed on the first try and after one retry.

### V-4: Use the web app with a keyboard and a screen reader
**Story.** As a reviewer, I want the wizard to be accessible, so that the project meets the standard it claims.
**Requirements:** N-5

- [ ] Every screen can be used with a keyboard alone.
- [ ] Text and controls meet WCAG 2.1 AA contrast and labeling rules.
- [ ] The accessibility check is recorded in the gate report.

### V-5: Read what is collected and what permissions are requested
**Story.** As a reviewer, I want a plain privacy notice and short permissions, so that I can see the project limits its data.
**Requirements:** N-1, N-3

- [ ] `docs/privacy.md` lists what is kept, what is never kept, and the 90-day limit.
- [ ] The permissions list has no restricted scopes.
- [ ] The Google permission screen matches the list in the privacy notice.

### V-6: Confirm the project costs nothing and its tests run with no AI key
**Story.** As a reviewer, I want to check the zero-cost claim, so that I trust the project's budget.
**Requirements:** N-4, N-7

- [ ] The test suite and the production build pass with no AI key set.
- [ ] No billing account is linked, and the hosting and database plans are free.
- [ ] The schema and engine decision logic have unit tests.
