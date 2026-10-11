# Build Plan: Logging System Setup Wizard (Revision 2)

Working name: **LogWizard** (rename anytime).

This file is the plan for Claude Code. Read it fully before writing any code. Work one phase at a time, and stop at every **GATE** to report back to Aaron before continuing. `AUDIT.md` explains what changed from the first draft and why.

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

### Platforms

- **Google (build it):** Google Sheets, Google Forms, Google Apps Script, Gmail (send only).
- **Microsoft (design only, Phase 5):** a written design for Excel Online, Power Automate, and Outlook, with an optional small prototype.
- **Hosting:** Vercel. Expo is not used because mobile apps are out of scope (see `docs/decisions/0001-vercel-not-expo.md`).

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
| Web app | Next.js (App Router) + TypeScript | Host on Vercel |
| Styling | Tailwind CSS | Keep the UI simple and readable. Target WCAG 2.1 AA. |
| Schema validation | Zod | One schema shared by the AI step, the web app, and the engine |
| AI | Anthropic API via the official TypeScript SDK | Tool use / structured output so the reply is JSON. Model name comes from `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`; confirm in Spike 6). |
| Google sign-in and API access | Google OAuth 2.0, Drive API, Sheets API | Narrowest scopes that work (decided in Phase 0) |
| Engine inside the user's sheet | Google Apps Script | Managed locally with `clasp` |
| Engine bundling | esbuild | Needs approval. Bundles `engine-logic` and the plan validator into one Apps Script file, because `clasp` does not bundle imports. |
| Tests | Vitest for TypeScript; pure engine logic also tested in Node | |
| Database | **Supabase (new dedicated project), anonymous metrics only** | See below |
| Abuse protection | Vercel BotID, input length caps, per-visitor rate limit, Anthropic spend cap | Protects the paid AI endpoint |

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
- No free-form code, formulas, or scripts anywhere in the plan. Plan text (names, labels, options) is plain text only. Reject strings that start with `=` or `@`, strings that start with `+` or `-` followed by a digit or `(`, and strings containing control characters. Ordinary labels such as "- Other -" or "+1 phone" style text can be handled by trimming, not by rejection; decide the exact rule in Phase 1 with test cases.
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

- The full interview, AI plan, validation, and editable preview all work.
- The final step shows a **view-only sample sheet** (published by Aaron, built from the sample plan) and a link to a short recorded walkthrough of the Activate and reminder steps.
- Demo mode is the default path for hiring managers. The real Google build is the path for Aaron and his test users.

### AI evaluation set

Create `evals/personas/` with at least 10 synthetic personas written as answer sets (career center, small nonprofit donor tracking, a church volunteer coordinator, a real estate agent tracking leads, a teacher tracking parent contacts, a vague user, a user who lists 40 fields, a user who asks for something impossible like "text me on WhatsApp", a user whose answers try to steer the AI, and so on).

Each persona file has two parts:

- `answers`: the interview answers.
- `expected`: the features the user actually asked for (for example `log_count`, `has_routing`, `has_weekly_digest`, `alert_on_contributor_entry`, `must_refuse: ["whatsapp"]`).

An eval script runs every persona through the planner and reports:

- How many plans pass validation on the first try and after one retry.
- Any plan that exceeds limits, or differs from `expected` (missing or invented features). This is an automatic diff, not a judgment call.
- Cost and time per run.

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
/docs                     Analyst artifacts (see Phase 6) and decisions/
SPIKES.md                 Findings from Phase 0
AUDIT.md                  Review of the first draft
PLAN.md                   This file
```

---

## 8. Phases

Each phase lists tasks, then **acceptance criteria** (how we know it is done). Stop at each **GATE**.

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
6. **AI model.** Confirm the current Anthropic model name and structured output approach in the docs.
7. **Scopes.** Confirm the exact minimal `oauthScopes` list the engine needs (no restricted scopes).

Also in Phase 0: draft `docs/requirements.md` (problem, users, goals, non-goals) and the first decision records in `docs/decisions/`.

Acceptance: `SPIKES.md` answers all seven with evidence and a decision.

**GATE 0:** Report findings to Aaron. Do not start Phase 1 until he approves any design changes.

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

**GATE 2:** Send Aaron screenshots and a short screen recording script for him to verify.

### Phase 3: Interview and AI planner

1. Build the interview screens from section 5, including the abuse controls (length caps, BotID, rate limit).
2. Call the AI with the answers and the schema; validate; retry once with the error list; show the preview from `plainEnglishSummary`.
3. Let the user edit fields, options, and reminders in the preview before approving.
4. Let the user download the plan as JSON.
5. Build **Demo mode** (section 5a).
6. Record anonymous funnel events to Supabase (section 3).
7. Build and run the eval set.

Acceptance: eval targets met; the API key and Supabase service key are server-side only; no interview answers are stored after the session ends; the metrics tables contain no personal data (verify with a query).

### Phase 4: Google build step

1. Google sign-in with the scopes decided in Phase 0.
2. On approval: put the template copy in the user's Drive using the winning method, write the plan into `_plan`, name the file after the system, share it with listed contributors only if the user checks a box to allow it.
3. Show a success page with the sheet link and three plain steps: open it, click the menu, click "Activate." Include the Form link for contributors.
4. Handle errors in plain language (permission denied, quota hit, sign-in expired).

Acceptance: end-to-end test in a fresh test Google account from interview to a working reminder email, timed. Record the time; the target is under 20 minutes total.

**GATE 4:** Aaron runs the full flow himself.

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
- **Ask before** adding dependencies not listed in section 3, changing the schema after Phase 1, applying database migrations, or expanding scope.
- **Stop at every GATE** and summarize: what was done, what was verified, what is uncertain, and what you need from Aaron.
- **Explain in plain language.** Aaron is technical but switching fields; define jargon the first time it appears in any report.

### 9a. Using oh-my-claudecode (OMC)

| Phase | Use |
|---|---|
| Setup | Run `deepinit` to generate project guidance files. Record gate status in project memory. |
| 0 Spikes | `research` and `external-context` for documentation checks. `tracer` agent when a spike result is unclear. |
| 1, 1.5, 2 | `tdd` skill and `executor` agent for schema and engine work. |
| 3 | `executor` for the API and planner, `designer` for the interview UI, `scientist` for eval analysis. |
| Every GATE | Run `verify`, then `code-reviewer` and `security-reviewer` agents. Include their findings in the gate report. |
| 6 | `writer` agent for drafts, then `ai-slop-cleaner`, and a check that no document contains an em dash. |

---

## 10. Before Phase 0: Aaron's checklist

- [ ] Confirm the employer outside-work and intellectual property policy allows this personal project.
- [ ] Create a free Google Cloud project and an OAuth consent screen (testing mode).
- [ ] Create a separate test Google account (not a work account).
- [ ] Get an Anthropic API key and set a monthly spending limit.
- [ ] Create a GitHub repository.
- [ ] Create a Vercel project linked to the repository.
- [ ] Create a new Supabase project for LogWizard (separate from the existing "Development" project).
- [ ] Publish a privacy page URL (from `docs/privacy.md`) for the OAuth consent screen.
- [ ] Install Node.js, pnpm, and `clasp`, and enable the Apps Script API in the test account's settings.
- [ ] Pick the final name.

---

## 11. Out of scope for this version

Payments, multiple organizations, any stored copy of users' plans, answers, or interaction records, SMS or chat app notifications, AI-generated code, mobile apps (including Expo), and a working Microsoft build (design only unless approved). The only data kept server-side is the anonymous metrics described in section 3.

---

## 12. Risk register

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| `drive.file` cannot copy the template | Medium | Phase 4 design changes | Spike 1 tests three methods before any build work |
| Contributors blocked by unverified app warning | High if unaddressed | Poor user experience | Contributors use the Form, which needs no approval |
| AI cost or abuse | Medium | Unexpected bill | Length caps, rate limit, BotID, spend cap |
| Plan has a wrong time zone or hour | Medium | Reminders at the wrong time | `time_zone` in schema, DST tests, preview shows the time in words |
| Email limit hit | Low | Missed reminders | Batching, send counter, `Activity` warning |
| Hiring manager cannot try the app | High if unaddressed | Portfolio loses impact | Demo mode, recorded walkthrough |
| Scope grows | Medium | Project stalls | Gates, out-of-scope list, ask-before rule |
