# Build Plan: Logging System Setup Wizard (Revision 2)

Working name: **LogWizard** (rename anytime).

This file is the plan for Claude Code. Read it fully before writing any code. It is built to be run by a **multi-agent team using oh-my-claudecode (OMC)** with as little human involvement as possible. Section 9a says how the team is set up and what it may and may not do alone. Section 9b lists the few steps only Aaron can do. `AUDIT.md` explains what changed from the first draft and why.

**Autonomy in one paragraph.** Agents do all code, tests, docs, and verification on their own, in parallel where files do not overlap. At each **GATE** an automated check runs and the result is written to `docs/gates/`. Most gates pass or fail without waiting for Aaron. Work stops for a human only at the **human-only steps** in section 9b, because those involve accounts, passwords, Google permission prompts, or money, which an agent must not do on anyone's behalf.

---

## 1. What we are building

A web app that interviews a non-technical person in plain language, uses AI to turn their answers into a setup plan, shows them a preview, and then builds a working interaction-logging system in their own Google account.

The logging system it builds is modeled on one Aaron already built by hand five times for a university career center:

- **Logs:** spreadsheets where each row records one interaction (for example, an email with an employer).
- **Entry form:** a simple form for adding entries, so people do not type directly into the sheet.
- **Cross-logging (routing):** when one entry belongs to more than one area, it is copied to every relevant log.
- **Reminders:** scheduled emails, such as "these follow-ups are due tomorrow."
- **Alerts:** an email to the owner when someone else adds an entry.

### Goal of the project

This is a **portfolio project to show hiring managers** for analyst, systems, and implementation roles. It is not a commercial product. That means:

- Quality, clarity, and documentation matter more than feature count.
- The project must produce analyst artifacts (requirements, user stories, data model, test plan, case study), not just code.
- One platform working well (Google) beats two platforms half working.
- A hiring manager must be able to see it work **without a Google sign-in** (Demo mode, section 5a).
- **The project costs $0 to build and to run** (section 3a). No paid plan, no paid API, no purchased domain.

### Platforms

- **Google (build it):** Google Sheets, Google Forms, Google Apps Script, Gmail (send only).
- **Microsoft (design only, Phase 5):** a written design for Excel Online, Power Automate, and Outlook, with an optional small prototype.
- **Hosting:** Vercel Hobby (free). Expo is not used because mobile apps are out of scope (see `docs/decisions/0001-vercel-not-expo.md`).

---

## 2. The core design rule (do not break this)

**The AI writes a plan. Ordinary, tested code builds the system. The AI never writes code that runs in the user's account.**

The flow is:

1. **Interview.** The app asks the user questions.
2. **Plan.** The AI converts the answers into a JSON plan that follows a fixed schema (section 4).
3. **Validate.** The app checks the plan against the schema with strict limits. If it fails, the app sends the errors back to the AI once to fix. If it fails again, the app shows the user a friendly error.
4. **Preview.** The app shows the plan in plain English ("I will create 2 logs, a reminder every Monday at 8am, and an alert when contributors add entries") and lets the user edit or approve it.
5. **Build.** After approval, the app puts a copy of a pre-built template spreadsheet in the user's Google Drive and writes the plan into it. A fixed, pre-written Apps Script "engine" inside the template reads the plan and does everything else.

Why this matters: an AI mistake can only produce a bad plan, and bad plans are caught by validation and the human preview. It can never produce bad code in someone's account.

Interview answers are **untrusted input**. They could contain text that tries to steer the AI ("ignore your instructions..."). The schema plus the human preview are the safety net, so the planner prompt never gets tools, and the server never acts on AI output except by validating it.

---

## 3. Tech stack

| Part | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces | Needs approval (new tool) |
| Web app | Next.js (App Router) + TypeScript | Host on Vercel Hobby (free), on the free `*.vercel.app` address |
| Styling | Tailwind CSS | Keep the UI simple and readable. Target WCAG 2.1 AA. |
| Schema validation | Zod | One schema shared by the AI step, the web app, and the engine |
| AI planner | A provider interface with three modes: **replay** (default, free), **bring-your-own-key** (visitor pastes their own key), and **live** (off) | See section 3a. Anthropic TypeScript SDK is used only by the bring-your-own-key and live modes. Tool use / structured output so the reply is JSON. |
| Google sign-in and API access | Google OAuth 2.0, Drive API, Sheets API | Narrowest scopes that work (decided in Phase 0) |
| Engine inside the user's sheet | Google Apps Script | Managed locally with `clasp` |
| Engine bundling | esbuild | Needs approval. Bundles `engine-logic` and the plan validator into one Apps Script file, because `clasp` does not bundle imports. |
| Tests | Vitest for TypeScript; pure engine logic also tested in Node | |
| Database | **Supabase Free plan (new dedicated project), anonymous metrics only** | See below. The app must work when Supabase is paused or unreachable. |
| Abuse protection | Input length caps and a per-visitor rate limit | There is no paid endpoint to protect in the default mode |

### 3a. The zero-cost rule

This is a portfolio project, not a product. **Nothing in it may cost money.** The rule applies to the build and to the running site.

| Part | How it stays free |
|---|---|
| Hosting | Vercel Hobby plan, `*.vercel.app` address. No custom domain is bought. |
| Database | Supabase Free plan only. If a free project cannot be created, metrics fall back to a local file written during Aaron's own runs, and nothing else changes. Free projects can pause after a period of inactivity, so the app treats metrics as optional and keeps working without them. |
| Google | A Google Cloud project **with no billing account linked**. The Drive, Sheets, Forms, and Apps Script features used here have no charge for this volume. |
| AI | **Replay mode is the default** (below). The paid API is never needed to run, test, or demo the app. |
| Domain, email, SMS, monitoring | None are purchased. Reminder emails go through the owner's own Gmail quota. |
| Agent team | The OMC run uses Aaron's existing Claude Code plan. It cannot be made free, so it is capped by `OMC_RUN_BUDGET_TOKENS` (section 9a). The team reports usage at each gate. |

**AI modes.**

1. **Replay (default, $0).** The interview offers the sample personas (career center, nonprofit donors, volunteer coordinator, and so on). The visitor picks one and watches the interview fill in, the plan appear, validation run, and the preview open for editing. The plans are recorded outputs saved in `evals/recordings/`. Editing the preview, validation, the plain-English summary, and download all work live, with no AI call.
2. **Bring your own key (optional, $0 to Aaron).** A visitor who wants to try their own answers can paste their own API key. It stays in the browser's memory for that session, is sent only with the request, and is never stored or logged. Aaron pays nothing.
3. **Live (off).** A server-side key would spend Aaron's money, so this mode is **not part of the plan**. It exists as a setting only so the code path is tested. If Aaron decides to add a key someday, that is a scope decision (section 9b, item E), not something the team does.

**Recorded plans are honest.** The team makes the recordings by running the planner prompt and schema through Claude Code subagents, not through the paid API. Every recording and every eval table is labeled with how it was produced, and the case study says so. Eval numbers describe the planner prompt and schema; they are not claimed to be API measurements.

**Cost guard (checked at every gate).**

- The test suite and the production build must pass with **no** `ANTHROPIC_API_KEY` set.
- No code path reads a server-side AI key unless live mode is switched on explicitly.
- No billing account is linked to Google Cloud, Supabase and Vercel are on free plans, and no paid add-on is enabled. The team checks what it can see (for example the Supabase cost check, the Vercel plan) and lists the rest for Aaron to confirm at H0.
- Any step that could incur a charge is a human-only item, and its default answer is "skip".

### What Supabase stores (and what it never stores)

Supabase holds only two tables, both without personal data:

- `funnel_events`: random session id, step name, duration in ms, validation result (`pass`, `fail`, `retry_pass`), retry count, timestamp. This supplies the measured numbers for the case study.
- `rate_limits`: hashed visitor key, window start, request count.

Rules:

- No emails, interview answers, plans, or sheet links are ever written to Supabase.
- Row Level Security (RLS, per-row access rules) is on for both tables. The browser has no access; only the server route inserts, using the service key kept in Vercel environment variables.
- A scheduled job (`pg_cron`) deletes rows older than 90 days.
- Migrations live in `/supabase/migrations` and are reviewed before applying.
- `docs/privacy.md` states all of this in plain language.

Do not add other major dependencies without asking Aaron first.

---

## 4. The plan schema (the contract)

Everything depends on this. Define it once in `packages/plan-schema` and use it everywhere, including inside the bundled Apps Script engine.

### Example plan

```json
{
  "schema_version": 1,
  "system_name": "Employer Outreach Log",
  "time_zone": "America/Chicago",
  "owner": { "name": "Sample Owner", "email": "owner@example.com" },
  "contributors": [
    { "name": "Sample Rep", "email": "rep@example.com", "role": "contributor" }
  ],
  "logs": [
    {
      "id": "main",
      "name": "All Employers",
      "fields": [
        { "key": "org_name", "label": "Organization", "type": "text", "required": true },
        { "key": "contact_email", "label": "Contact email", "type": "email", "required": false },
        { "key": "interaction", "label": "Interaction type", "type": "choice",
          "options": ["Email", "Call", "Meeting", "Event"], "required": true },
        { "key": "date", "label": "Date", "type": "date", "required": true },
        { "key": "area", "label": "Area", "type": "multi_choice",
          "options": ["Education", "Psychology", "Arts"], "required": true },
        { "key": "follow_up", "label": "Follow-up date", "type": "date", "required": false },
        { "key": "notes", "label": "Notes", "type": "long_text", "required": false }
      ]
    },
    { "id": "education", "name": "Education Log", "copy_fields_from": "main" }
  ],
  "routing_rules": [
    { "from": "main", "when": { "field": "area", "includes": "Education" }, "copy_to": "education" }
  ],
  "reminders": [
    { "type": "follow_up_due", "log": "main", "date_field": "follow_up", "days_before": 1,
      "notify": ["owner"], "send_hour": 8 },
    { "type": "weekly_digest", "day": "MON", "send_hour": 8, "notify": ["owner"] }
  ],
  "alerts": [
    { "on": "new_entry", "when_entered_by": "contributor", "notify": ["owner"] }
  ]
}
```

### Rules the validator must enforce

- `time_zone` is a valid IANA time zone name.
- Field `type` is one of: `text`, `long_text`, `email`, `phone`, `date`, `number`, `choice`, `multi_choice`, `yes_no`, `url`.
- `choice` and `multi_choice` require 1 to 30 `options`.
- Limits: at most 6 logs, 25 fields per log, 20 routing rules, 10 reminders, 5 alerts, 20 contributors.
- Every `key` is lowercase letters, numbers, and underscores, unique within its log.
- Every `routing_rules[].from`, `routing_rules[].copy_to`, and `copy_fields_from` points to a log `id` that exists. No rule routes a log to itself.
- A routing rule's `field` must exist in its `from` log and be a `choice` or `multi_choice` field. `includes` must be one of that field's options.
- A routing target must use `copy_fields_from` the rule's `from` log. `copy_fields_from` may not point to a log that itself uses `copy_fields_from` (no chains).
- Every `date_field` points to a `date` field in the reminder's `log`.
- Every `notify` target is `owner`, `contributors`, or an email listed in the plan.
- Emails must be valid. `send_hour` is 0 to 23.
- No free-form code, formulas, or scripts anywhere in the plan. Plan text is plain text only. The exact text-safety rule and the other Phase 1 choices are in `docs/decisions/0006-schema-ambiguities.md`.
- Length caps on every string (for example 80 characters for names and labels, 60 for options).

Write unit tests for every rule, with a passing and failing fixture for each.

**Known limit (document it):** a routed copy is a snapshot. Editing the original row later does not update the copies.

---

## 5. The interview

The interview is a guided form with an AI-assisted step, not an open chat. Keep it short: the target is under 10 minutes.

### Question bank (starting point)

1. What kind of interactions do you want to track? (employers, clients, students, donors, vendors, other)
2. What should we call this system?
3. What details do you record for each interaction? (offer common suggestions based on answer 1, let them add or remove)
4. Do you sort entries into areas, teams, or categories? What are they?
5. Should an entry tagged with more than one area appear in each of those areas' own logs?
6. Who else will add entries? (names and emails)
7. Do you want an email when someone else adds an entry?
8. Do you track follow-up dates? How many days ahead do you want a reminder?
9. Would you like a weekly summary email? Which day and time?
10. What time zone are you in? (Pre-fill from the browser, let the user change it.)

The AI's job is to: suggest sensible fields from the free-text answers, turn the answers into a schema-valid plan, and write the plain-English preview. If an answer is unclear, the AI may ask **at most two** follow-up questions in total.

Input limits: each free-text answer is capped (for example 500 characters) and the whole interview is capped before it reaches the AI.

### 5a. Demo mode

Demo mode lets anyone try the wizard **without signing into Google**:

- The full interview, plan, validation, and editable preview all work, using replay mode by default (section 3a). Bring-your-own-key mode lets a visitor try their own answers.
- The final step shows a **view-only sample sheet** (published by Aaron, built from the sample plan) and a link to a short recorded walkthrough of the Activate and reminder steps.
- Demo mode is the default path for hiring managers. The real Google build is the path for Aaron and his test users.

### AI evaluation set

Create `evals/personas/` with at least 10 synthetic personas written as answer sets (career center, small nonprofit donor tracking, a church volunteer coordinator, a real estate agent tracking leads, a teacher tracking parent contacts, a vague user, a user who lists 40 fields, a user who asks for something impossible like "text me on WhatsApp", a user whose answers try to steer the AI, and so on).

Each persona file has two parts:

- `answers`: the interview answers.
- `expected`: the features the user actually asked for (for example `log_count`, `has_routing`, `has_weekly_digest`, `alert_on_contributor_entry`, `must_refuse: ["whatsapp"]`).

An eval script runs every persona through the planner and reports (recordings are labeled with how they were produced, per section 3a):

- How many plans pass validation on the first try and after one retry.
- Any plan that exceeds limits, or differs from `expected` (missing or invented features). This is an automatic diff, not a judgment call.
- Time per run. Cost is $0 by design; token counts are recorded where the run provides them.

Target: 10 of 10 valid after one retry, and zero invented features. Save results to `evals/results.md`.

---

## 6. The engine (Apps Script inside the template)

A Google Sheets template that contains a fixed Apps Script project. When the app copies the template, the script comes along. The engine reads the plan from a hidden `_plan` tab, re-validates it with the same validator as the web app (bundled by esbuild), and then:

1. **Builds the logs:** one tab per log, with headers, data validation (dropdowns for choices, date checks), frozen header row, and readable formatting. Sets the spreadsheet time zone from `time_zone`.
2. **Adds a menu** called the system's name, with: "Add entry", "Run routing now", "Send test reminder", "Activate", and "Help".
3. **Entry points:**
   - **Contributors use a Google Form** that the engine generates from the plan's fields. The form-submit trigger is installed by the owner at Activate, so it runs as the owner and contributors never see an authorization prompt.
   - **The owner can also use the sidebar** ("Add entry"), generated from the same fields.
   - Both paths go through the same code: write the row, apply routing, trigger alerts.
4. **Routing:** copies a submitted entry to each log its rules match, without creating duplicates (store an entry ID column).
5. **Reminders:** a daily time-based trigger checks follow-up dates and sends reminder emails; a weekly trigger sends the digest.
6. **Alerts:** on submission by someone other than the owner, emails the owner. The submitter is identified by the Form's collected email where Google provides it, with a required "Your name" question as the fallback (confirm in Spike 4).
7. **Activate:** the owner clicks this once. It asks for Google's permission prompt, installs the triggers, and writes a confirmation to a `Setup` tab.

### Engine rules

- Keep decision logic (routing matches, reminder date math, digest content) in **pure functions** in `packages/engine-logic`, so it can be tested in Node without Google.
- **Pin the OAuth scopes** in `appsscript.json`. Use `MailApp` (send only) instead of `GmailApp`. Expected list: `spreadsheets.currentonly`, `forms`, `script.scriptapp`, `script.send_mail`, `script.container.ui`. Confirm the final list in Phase 0.
- **Treat every user-entered value as text.** Write cells as plain text so a value like `=HYPERLINK(...)` never runs as a formula.
- **Locking:** wrap row writes and routing in `LockService` so two simultaneous submissions cannot interleave.
- **Triggers:** Activate keeps a named inventory and removes its own old triggers before installing new ones, so re-running it never creates duplicates.
- Never delete user data. Re-running setup must be safe to repeat (idempotent).
- Log errors to a visible `Activity` tab in plain language.
- **Respect email limits.** Gmail-based sending limits are lower for free personal accounts than for Workspace accounts (confirm the current numbers in Spike 5). Batch reminders into one email per person per day, count sends per day in script properties, and write a plain warning to `Activity` when close to the limit.

---

## 7. Repository layout

```
/apps/web                 Next.js app (interview, preview, Demo mode, Google sign-in, build step)
/packages/plan-schema     Zod schema, limits, validator, fixtures, tests
/packages/engine-logic    Pure routing and reminder functions + tests (bundled into Apps Script)
/apps-script              Template engine source, esbuild config, clasp config
/supabase/migrations      SQL for funnel_events, rate_limits, RLS, retention job
/evals                    Personas, eval runner, results
/docs                     Analyst artifacts (see Phase 6), decisions/, gates/ (gate reports),
                          setup-guide.md (human steps), OPEN_ITEMS.md (questions for Aaron)
SPIKES.md                 Findings from Phase 0
AUDIT.md                  Review of the first draft
PLAN.md                   This file
```

---

## 8. Phases

Each phase lists tasks, then **acceptance criteria** (how we know it is done). Each **GATE** is one of two kinds:

- **AUTO-GATE:** the verification team (section 9a) runs, writes `docs/gates/GATE-N.md`, and the lead continues if everything passes. If it fails, the fix loop runs. The team stops only after the loop limits in section 9a.
- **HUMAN-GATE:** the team stops and waits for Aaron. These line up with the human-only steps in section 9b.

Gate types: GATE 0 is an AUTO-GATE once Spikes 2 to 4 are done at human step H2 (until then, the team continues with phases that do not depend on them). GATE 2 is an AUTO-GATE. GATE 4 is a HUMAN-GATE (step H3).

### Phase 0: Verify risky assumptions (spikes)

Small experiments, not product code. Record each result in `SPIKES.md` as: question, what was tried, result, decision.

1. **Template copy.** Test, in this order, and record which is the first to work:
   - (a) The app copies the template with the Drive API using the narrow `drive.file` scope.
   - (b) The user picks the template with the Google Picker, which grants `drive.file` access to it.
   - (c) Fallback: the app shows a "Make a copy" link and the plan to paste into `_plan`.
2. **Bound script.** Does the script come along with the copy and run after the user clicks "Activate"? Does the plan need to be written by the app, or can the script fetch it?
3. **Permission prompt.** What does the Google prompt look like for an unverified app in testing mode, and how many test users are allowed? Does the prompt differ for the contributor-via-Form path?
4. **Submitter identity.** Can the engine reliably identify who submitted an entry in a personal Gmail account versus a Workspace account (Form collected email, `Session.getActiveUser()`)? If not, use a required "Your name" question as the fallback.
5. **Email limits.** Current daily sending limits for personal and Workspace accounts, for `MailApp`.
6. **AI planner approach.** Confirm the structured output approach in the docs. No paid call is made in this spike.
7. **Scopes.** Confirm the exact minimal `oauthScopes` list the engine needs (no restricted scopes).

Also in Phase 0: draft `docs/requirements.md` (problem, users, goals, non-goals) and the first decision records in `docs/decisions/`.

Acceptance: `SPIKES.md` answers all seven with evidence and a decision.

**GATE 0 (AUTO-GATE, with one condition):** The critic agent reviews `SPIKES.md`. If a spike result forces a design change (for example, Spike 1 methods (a) and (b) both fail), the team writes a decision record and updates this plan before Phase 1 depends on it. Changes that only affect Phase 4 do not block Phases 1 to 3. A change to what the product is or does goes to Aaron (section 9b, item E).

### Phase 1: Plan schema and validator

1. Build the Zod schema from section 4 with every rule and limit.
2. Create at least 20 fixtures (valid and invalid) and unit tests, including the time zone, routing, and text-safety rules.
3. Write `plainEnglishSummary(plan)` that produces the preview text without AI (deterministic), so the preview never depends on the AI being right.

Acceptance: all tests pass; the example plan in section 4 validates; each rule has a failing fixture.

### Phase 1.5: Walking skeleton

Before any interview UI exists, prove the whole chain with a hard-coded plan:

1. Esbuild bundles `engine-logic` and the validator into the Apps Script project.
2. The app (or a script) uses the winning method from Spike 1 to get the template into a test account and writes the section 4 plan into `_plan`.
3. Click Activate. Submit one entry through the generated Form. See it routed and receive one email.

Acceptance: one end-to-end run with the sample plan, timed.

### Phase 2: Engine in the template

1. Write pure logic in `packages/engine-logic` with tests first (routing, duplicate prevention, reminder date math including time zones and daylight saving, digest grouping, send counting).
2. Build the Apps Script engine and template sheet using `clasp` and esbuild.
3. Test manually with the section 4 plan in a test Google account, using both the Form and the sidebar.

Acceptance: from a pasted plan, the engine builds the tabs, the Form and sidebar both work, routing copies correctly without duplicates, "Send test reminder" sends one email, user-entered text beginning with `=` stays plain text, and re-running setup changes nothing (no duplicate triggers).

**GATE 2 (AUTO-GATE):** Engine unit tests pass, the bundled script passes a syntax and scope check, and the verifier confirms the Phase 2 acceptance list against the test account output captured at H2. Screenshots and a short recording script are saved in `docs/gates/GATE-2.md` for Aaron to look at later; the team does not wait for them.

### Phase 3: Interview and AI planner

1. Build the interview screens from section 5, including the input length caps and rate limit, and the three AI modes in section 3a.
2. Call the AI with the answers and the schema; validate; retry once with the error list; show the preview from `plainEnglishSummary`.
3. Let the user edit fields, options, and reminders in the preview before approving.
4. Let the user download the plan as JSON.
5. Build **Demo mode** (section 5a).
6. Record anonymous funnel events to Supabase (section 3).
7. Build and run the eval set.

Acceptance: eval targets met on recorded plans; the app builds, runs, and passes its tests with no AI key set; a bring-your-own-key key is never stored or logged (verify by test); the Supabase service key is server-side only and the app still works with Supabase unreachable; no interview answers are stored after the session ends; the metrics tables contain no personal data (verify with a query).

### Phase 4: Google build step

1. Google sign-in with the scopes decided in Phase 0.
2. On approval: put the template copy in the user's Drive using the winning method, write the plan into `_plan`, name the file after the system, share it with listed contributors only if the user checks a box to allow it.
3. Show a success page with the sheet link and three plain steps: open it, click the menu, click "Activate." Include the Form link for contributors.
4. Handle errors in plain language (permission denied, quota hit, sign-in expired).

Acceptance: end-to-end test in a fresh test Google account from interview to a working reminder email, timed. Record the time; the target is under 20 minutes total.

**GATE 4 (HUMAN-GATE):** Aaron runs the full flow himself (step H3 in section 9b). Everything before this point is already built, tested, and documented, so H3 is a timed run, not a review session.

### Phase 5: Microsoft adapter (design)

Write `docs/MICROSOFT_ADAPTER.md` covering:

- Mapping: Sheets to Excel Online tables (or SharePoint Lists), Apps Script to Power Automate, Gmail to Outlook, Google Forms to Microsoft Forms, Google OAuth to Microsoft Entra ID, Looker Studio to Power BI.
- How the same plan JSON would drive it, and which parts the existing schema already covers.
- What cannot easily be automated (for example, creating Power Automate flows programmatically may require admin rights or premium licensing; verify current rules) and the manual fallback.
- Effort estimate and open questions.

Optional stretch, only if Aaron approves: a small prototype that creates an Excel workbook with the log tables through Microsoft Graph.

### Phase 6: Portfolio artifacts

Write in plain language, aimed at a hiring manager who will skim. No em dashes in any document.

1. `docs/requirements.md`: problem statement, users, goals, non-goals, functional and non-functional requirements (including WCAG 2.1 AA, privacy, and cost limits).
2. `docs/user-stories.md`: user stories with acceptance criteria.
3. `docs/data-model.md`: the plan schema and sheet structure, with a Mermaid diagram.
4. `docs/test-plan.md`: unit tests, eval set, and a user acceptance test (UAT) script for 3 testers.
5. `docs/traceability.md`: a table linking each requirement to its user story and its test.
6. `docs/decisions/`: short decision records (Vercel not Expo, Form for contributors, minimal Supabase, plan-not-code).
7. `docs/privacy.md`: what is collected, what is not, retention. Also used as the OAuth consent screen privacy link.
8. `docs/case-study.md`: the before and after. Before: Aaron's hand-built setup time. After: measured wizard setup time, eval pass rate, number of manual steps. Only report numbers that were actually measured.
9. `docs/demo-script.md`: a 3-minute demo walkthrough.
10. `README.md`: what it is, a screenshot, a link to Demo mode, how to run it, and links to the docs.

---

## 9. Rules for Claude Code

- **Synthetic data only.** Never use real people, students, employers, or emails. Use `example.com` addresses.
- **Secrets** go in `.env.local`, which must be in `.gitignore`. Provide `.env.example` with placeholder values.
- **Tests first** for the schema and engine logic.
- **Small commits** with clear messages, one task per commit where practical.
- **Dependencies, schema changes, and migrations.** The dependencies in section 3 are pre-approved when Aaron approves this plan (pnpm, esbuild, clasp, and the free packages the web app needs). Any other dependency needs a decision record and a critic agent sign-off, and must be free to use. A schema change after Phase 1 needs a decision record, a critic sign-off, and updated tests. Database migrations may be applied only to the LogWizard Supabase project, never to any other project.
- **Scope changes go to Aaron.** Anything that changes what the product does or promises (a new platform, new data stored server-side, a new feature class) is a human item (section 9b, item E). The team records the question, keeps working on everything else, and does not guess.
- **At every GATE** write the gate report to `docs/gates/GATE-N.md`: what was done, what was verified, what is uncertain, and what needs Aaron.
- **Explain in plain language.** Aaron is technical but switching fields; define jargon the first time it appears in any report.

### 9a. The autonomous OMC team

**How it runs.** One lead session orchestrates a team of named agents using OMC's `team` skill, wrapped in `ralph` for retry-until-verified. The team's built-in stages are `team-plan`, `team-prd`, `team-exec`, `team-verify`, and `team-fix`, and it loops through exec, verify, and fix until verification passes or a stop condition is reached. The phases in section 8 are the work breakdown.

**Durable progress.** `ultragoal` keeps a ledger of one goal per phase under `.omc/ultragoal`. It survives restarts. The `.omc/` folder is git-ignored, so the ledger lives on this machine only; the gate reports in `docs/gates/` are the committed record.

**Launch sequence (Aaron, once).**

1. Finish human steps H0 and H1 in section 9b.
2. Turn on agent teams: set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` for Claude Code (in `~/.claude/settings.json` under `env`). It is not set today.
3. In the repository, run `/oh-my-claudecode:deepinit` once to generate project guidance files.
4. Create the goals: `omc ultragoal create-goals --brief-file PLAN.md` (one goal per phase).
5. Type `/goal` with the aggregate objective that the ultragoal handoff prints. **Aaron has to type this;** the agent cannot set it for him.
6. Run `/oh-my-claudecode:team ralph "Execute PLAN.md phase by phase using the roster in section 9a"`.

**Roster.** Each worker owns specific folders and does not write outside them, so two agents never edit the same file. The lead is the only agent that commits and merges.

| Worker name | OMC agent | Owns | Used in |
|---|---|---|---|
| `lead` | the session itself | git, `docs/gates/`, status notes in `PLAN.md` | all phases |
| `scout` | `explore`, `document-specialist` | `SPIKES.md` | 0 |
| `architect` | `architect` | `docs/decisions/` | 0, any design change |
| `schema-dev` | `executor` + `tdd` | `packages/plan-schema` | 1 |
| `engine-dev` | `executor` + `tdd` | `packages/engine-logic`, `apps-script` | 1.5, 2 |
| `web-dev` | `executor` | `apps/web` (API routes, planner, Google build step) | 3, 4 |
| `ui-dev` | `designer` | `apps/web` UI components only | 3 |
| `data-dev` | `executor` | `supabase/migrations`, funnel and rate-limit code | 3 |
| `eval-dev` | `scientist` | `evals/` | 3 |
| `docs-dev` | `writer` | `docs/` except `docs/decisions` and `docs/gates` | 0, 5, 6 |
| `verifier` | `verifier`, `test-engineer` | nothing (read and run only) | every gate |
| `reviewer` | `code-reviewer`, `security-reviewer` | nothing (read only) | every gate |
| `critic` | `critic` | nothing (read only) | plan changes, Gate 0 |

Where files do not overlap, workers run in parallel. For example `scout` and `schema-dev` start together; `engine-dev` starts once the schema types are committed; `web-dev`, `data-dev`, and `eval-dev` run together in Phase 3; `docs-dev` refreshes each document as its phase finishes.

**Automated gate (every AUTO-GATE).**

1. `verifier` runs all tests, runs the section 4 example plan through the validator, and checks the phase acceptance list line by line.
2. `reviewer` reviews the diff for correctness and security (secrets, scopes, injection, data stored server-side).
3. A scan confirms no em dashes in documents, no real emails (only `example.com`), and no secrets in git.
4. The report goes to `docs/gates/GATE-N.md`. Pass means the lead merges and starts the next phase.

**Autonomy limits (stop conditions).**

- Fix loop: at most 5 exec, verify, fix cycles per phase. If the same error appears 3 times, stop that phase, record the root cause in the gate report, and move on to any phase that does not depend on it.
- Budget: set `OMC_RUN_BUDGET_TOKENS` before launch, since the agent run is the one cost that cannot be zero. At 90% the team finishes the current phase; at 100% it stops with state saved, and a relaunch resumes.
- Unknowns: when a decision belongs to Aaron, the team records it in `docs/OPEN_ITEMS.md` with the assumption it is working under, keeps going on unblocked work, and leads its final report with the open items.
- The team never works around a human-only step (section 9b) and never asks for or handles passwords, API keys, or tokens. Secrets go into `.env.local` and Vercel environment settings, entered by Aaron.
- The team never enables a paid plan, links a billing account, buys anything, or turns on a paid API. Any step that could cost money is a human-only item and defaults to "skip". The team never pushes to a remote or deploys to production without a human step. Deploys to Vercel preview URLs on the free plan are allowed after H1.

**OMC tools by phase.**

| Phase | Use |
|---|---|
| 0 Spikes | `scout` runs `research` and `external-context` for documentation checks. `tracer` agent when a spike result is unclear. |
| 1, 1.5, 2 | `tdd` skill and `executor` agents for schema and engine work. |
| 3 | `executor` for the API and planner, `designer` for the interview UI, `scientist` for eval analysis. |
| Every GATE | `verify`, then `code-reviewer` and `security-reviewer`. |
| 6 | `writer` for drafts, then `ai-slop-cleaner`, and a no-em-dash check. |

### 9b. Human-only steps

These cannot be done by an agent. Each one involves an account, a password, or a Google permission prompt. Nothing here involves spending money. The team batches them into three short sessions so Aaron is interrupted as little as possible. Agents prepare everything before each session and check the results after it.

| Step | When | What Aaron does | What the team prepares or checks |
|---|---|---|---|
| **H0: Accounts and keys** (about 30 minutes, once) | Before launch | Items A to D below | Provides exact click-by-click instructions in `docs/setup-guide.md`. Verifies each setting afterward by running a check script that never prints secret values. |
| **H1: Approve the plan** (about 5 minutes) | Before launch | Approve this plan. That approves the pre-approved dependencies and permits creating the LogWizard Supabase project and Vercel project. The team checks the Supabase cost and creates the project only if it is on the Free plan. | Setup worker installs pnpm, esbuild, clasp, and creates the two projects. |
| **H2: Google hands-on** (about 15 to 20 minutes) | After Phases 1 to 2 are built and the template exists | In the test Google account: click the "Make a copy" link, then Activate, and click Allow on Google's permission prompt. Submit one test Form entry. | Runs Spikes 1 to 4 as a numbered script of what to click, with expected results. Collects the output and writes `SPIKES.md` and the GATE 2 report. |
| **H3: Final timed run** (about 20 minutes) | After Phases 3 to 4 | Run the full flow from the interview to a reminder email, with a timer. | Sets up the run sheet and a one-page checklist. Records the time and step counts for `docs/case-study.md`. |

The human items:

- **A. Policy and ownership.** Confirm the employer outside-work and intellectual property policy allows this personal project. Pick the final name.
- **B. Google.** Create a free Google Cloud project and an OAuth consent screen (testing mode). Create a separate test Google account (not a work account). Enable the Apps Script API in that account's settings.
- **C. Keys.** No paid key is needed. Put the Google OAuth client ID and secret and the Supabase service key in `.env.local` and in Vercel environment settings. Confirm that Google Cloud has no billing account linked and that Vercel shows the Hobby plan.
- **D. Repository.** Create the GitHub repository and connect Vercel to it. The team does not push; Aaron pushes or approves the first push.
- **E. Scope decisions.** Answer entries in `docs/OPEN_ITEMS.md` when the team reaches the end of its unblocked work.

If an agent is asked to do any of A to D on Aaron's behalf (for example, create an account), it declines and points to `docs/setup-guide.md`.

---

## 10. Before launch: checklist

Agents handle the items marked (team). Aaron handles the rest (see 9b).

- [ ] Confirm the employer outside-work and intellectual property policy allows this personal project. (Aaron, A)
- [ ] Create a free Google Cloud project and an OAuth consent screen in testing mode. (Aaron, B)
- [ ] Create a separate test Google account, not a work account, and enable the Apps Script API in its settings. (Aaron, B)
- [ ] Confirm no billing account is linked in Google Cloud, Vercel is on Hobby, and Supabase is on Free. (Aaron, C)
- [ ] Create a GitHub repository and connect Vercel to it. (Aaron, D)
- [ ] Create a new Supabase project for LogWizard, separate from the existing "Development" project. (team, after H1; only on the Free plan)
- [ ] Install pnpm, esbuild, and `clasp`. (team, after H1)
- [ ] Draft the privacy page from `docs/privacy.md` and host it on the Vercel preview URL so it can be used as the OAuth consent screen link. (team; Aaron pastes the URL into the consent screen)
- [ ] Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and `OMC_RUN_BUDGET_TOKENS`. (Aaron, section 9a launch sequence)
- [ ] Pick the final name. (Aaron, A)

---

## 11. Out of scope for this version

Payments, multiple organizations, any stored copy of users' plans, answers, or interaction records, SMS or chat app notifications, AI-generated code, mobile apps (including Expo), and a working Microsoft build (design only unless approved). Anything that costs money: paid plans, paid APIs, purchased domains, or a server-side AI key. The only data kept server-side is the anonymous metrics described in section 3.

---

## 12. Risk register

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| `drive.file` cannot copy the template | Medium | Phase 4 design changes | Spike 1 tests three methods before any build work |
| Contributors blocked by unverified app warning | High if unaddressed | Poor user experience | Contributors use the Form, which needs no approval |
| Any step quietly costs money | Low | Breaks the $0 rule | Replay mode by default, no server-side AI key, cost guard at every gate, free plans only |
| Supabase free project pauses | Medium | Metrics stop | App works without metrics; the demo does not depend on the database |
| Plan has a wrong time zone or hour | Medium | Reminders at the wrong time | `time_zone` in schema, DST tests, preview shows the time in words |
| Email limit hit | Low | Missed reminders | Batching, send counter, `Activity` warning |
| Hiring manager cannot try the app | High if unaddressed | Portfolio loses impact | Demo mode, recorded walkthrough |
| Scope grows | Medium | Project stalls | Gates, out-of-scope list, ask-before rule |
| Agents edit the same files or drift from the plan | Medium | Merge conflicts, wrong behavior | Folder ownership per worker, lead-only commits, automated gate with an independent verifier and reviewer |
| Autonomous loop burns budget or repeats a failure | Medium | Wasted cost, no progress | Fix-loop limits, token budget, stop-and-record after 3 identical errors |
| Agent teams flag is off, or `/goal` is not set | High at first launch | Team does not start | Launch sequence in 9a; `docs/setup-guide.md` checks both before starting |
| Human-only steps pile up and stall the run | Medium | Idle time | Batched into H0 to H3; unblocked phases continue while waiting |
