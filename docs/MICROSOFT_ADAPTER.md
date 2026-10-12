# Microsoft adapter (design only)

Status: design, written under Phase 5 of PLAN.md. Nothing here is built. No Microsoft account, tenant, flow, or workbook has been created. Google is the only platform that is built.

**Verification note.** This pass did not check Microsoft's current documentation. Every statement about licences, admin rights, connector availability, or service limits is marked **(verify before relying on this)**. Treat each marked item as a question to answer before any build starts.

---

## 1. Summary

The same plan JSON that drives the Google build could drive a Microsoft build. The plan, the schema, and the validator would stay the same. Only the engine changes: the Google engine is replaced by a Microsoft engine that reads the same plan and does the same jobs (tabs, entries, routing, reminders, alerts, activation).

The plan is a good fit for this because the AI never writes code (ADR 0002). An adapter only has to translate a checked plan into Microsoft objects. Most of the work is in three places: where the plan is validated, how reminders get their time zone, and how alerts know who entered a row.

This is a design, not a commitment. PLAN.md Phase 5 allows an optional prototype only if Aaron approves it. It has not been approved.

---

## 2. Mapping

Google pieces are taken from `apps-script/README.md` and `apps-script/src/`.

| Google today | Microsoft counterpart | Fit | Notes |
|---|---|---|---|
| Google Sheets, one tab per log | Excel for the web tables, one per log (or SharePoint Lists) | Good | An Excel table gives column headers and filtering. A SharePoint List gives typed columns and built-in "Created by". Both need checking for the plan's field types (verify before relying on this). |
| Column data validation (dropdowns, date and email checks) | Excel data validation on table columns | Good for list, whole number, decimal, and date. Partial for email and URL. | Check which validation types work on a table column in Excel for the web (verify before relying on this). |
| Apps Script engine (bound script, menu, triggers) | Power Automate cloud flows for triggers, plus Office Scripts for workbook work | Partial | Office Scripts run inside Excel for the web and are called from flows. A flow is not bound to the workbook the way a bound script is. |
| Hourly trigger (`hourlyTick`) | Power Automate recurrence trigger | Good | Set the time zone on the trigger. The workbook has no time zone setting to read (verify before relying on this). |
| Form submit trigger (`onFormSubmit`) | Power Automate trigger for new Microsoft Forms responses, or a row-added trigger on the entries table | Partial | Whether a Forms response trigger is available without a premium licence needs checking (verify before relying on this). |
| Google Forms (contributor entry, no approval prompt) | Microsoft Forms | Partial | Forms can take the same questions. Creating a form from code may not be supported (verify before relying on this). A generated question list may be the fallback. |
| `MailApp` (send only) | Outlook "send an email" action in a flow | Good for the owner account | The connector and its availability for personal accounts need checking (verify before relying on this). Sending limits differ by account type; no number is given here (verify before relying on this). |
| Gmail daily caps (`DAILY_CAPS`: 100 personal, 1500 Workspace) | Outlook sending limits | Unknown | Do not reuse the Google numbers. Look up current Outlook limits before writing any cap (verify before relying on this). |
| Google OAuth scopes (`appsscript.json`, six scopes) | Microsoft Entra ID app registration, delegated permissions | Partial | Consent rules differ between personal accounts and work or school tenants. Admin consent may be needed for some permissions (verify before relying on this). |
| Script properties (`sendCount`, `sent:<date>`, form ids) | A "Setup" table in the workbook, or a SharePoint List | Good | The Google build keeps these hidden. A Microsoft build would need a visible or protected place for them. |
| `LockService.getDocumentLock()` | Flow concurrency control, or a single-writer design | Partial | A direct equivalent is not known. Check flow concurrency settings before relying on them (verify before relying on this). |
| Spreadsheet time zone (`setSpreadsheetTimeZone`) | Time zone on each flow's recurrence trigger | Partial | No workbook-level setting is assumed. |
| Hidden `_plan` tab | Hidden worksheet, or a protected table | Good | Hidden worksheets are standard Excel behaviour (verify before relying on this). |
| Google sidebar ("Add entry") | Office Add-in task pane, or a Power Apps form | Not planned | Both add hosting and licensing questions. Out of scope for the first design. |
| Looker Studio (in PLAN.md Phase 5 list) | Power BI | Good for reports | Sharing a Power BI report can need a paid licence (verify before relying on this). Not part of the engine. |

---

## 3. The same plan JSON

### 3.1 What stays the same

- The plan format (`schema_version: 1`), its limits, and its text-safety rules (`packages/plan-schema`).
- The validator. The Google engine runs it inside Apps Script. A Microsoft engine would need a runtime that can run the same validator (see 3.3).
- The plain-English summary, which is deterministic and needs no AI (`plainEnglishSummary`).
- The routing, reminder date, digest, and send-cap decisions in `packages/engine-logic`, if the runtime allows them.

### 3.2 Schema parts and how they map

| Plan part | Microsoft target | Fit |
|---|---|---|
| `system_name` | Workbook or list name | Clean |
| `time_zone` | Time zone on each reminder and digest flow | Partial. The workbook does not carry it (verify before relying on this). |
| `owner` | Entra ID or Outlook address for the owner, and the owner's row in the access list | Clean for the address. Access rules need checking. |
| `contributors` (name, email, `role`) | A people table, and the permissions for the entries table | Partial. Sharing a workbook with people outside the owner's tenant may be restricted (verify before relying on this). |
| `logs` with `fields` | One Excel table per log, with one column per field, in plan order | Clean |
| `logs` with `copy_fields_from` | A table with the same columns as its base log | Clean |
| Field `type`: `choice`, `multi_choice`, `yes_no`, `date`, `number` | Table column validation (list, date, decimal) | Clean for list and date. `multi_choice` needs a text convention, because Excel has no multi-select column. |
| Field `type`: `text`, `long_text`, `phone`, `url`, `email` | Text columns, with email and URL checks where supported | Partial |
| `routing_rules` | A flow that fires on a row added to the source table, and adds a row to each target table when the field matches | Clean in principle. Matching a multi-select value needs the same text convention as above. |
| Routing snapshot (copies do not change later) | Same, by design: the flow copies values at the time it runs | Clean |
| `reminders` of type `follow_up_due` (`days_before`, `send_hour`, `date_field`) | A scheduled flow that reads the table, works out `date - days_before` in the plan's time zone, and sends one email per recipient per day | Clean in principle. The time zone is the hard part, and it must be set per flow. |
| `reminders` of type `weekly_digest` | A scheduled flow on the chosen day and hour that compiles a summary | Partial. The digest grouping logic in `digest.ts` would need to run in the flow, or be re-implemented. |
| `alerts` (on `new_entry`, when entered by a contributor) | A row-added flow that emails the owner | Partial. The flow must know who added the row. This depends on the table type (SharePoint "Created by" is one option; verify before relying on this). |
| `notify` lists | Email addresses in flow actions | Clean |
| Entry ID | A generated id column, filled by the flow | Partial. Excel tables have no built-in unique id; the flow must write one (verify before relying on this). |
| Text-safety rules (no leading `=`, `+`, `-`, `@` in plan text) | Same validator, plus writing values as text | Clean for the plan. Entry cells still need the same guard the Google engine uses. |

### 3.3 Where the validator runs

This is the main open design question.

| Option | Idea | Concern |
|---|---|---|
| A. Validate in the web app, pass a checked plan to the owner | The owner downloads the plan JSON and gives it to the Microsoft engine | Simple. No new runtime. The engine still needs its own checks if the plan is edited later. |
| B. Run the validator in an Office Script | The validator is plain TypeScript and compiles to JavaScript | Its size, its zod dependency, and whether Office Scripts allow it are unknown (verify before relying on this). |
| C. Run the validator in a flow | Would need a custom connector or an HTTP call | Likely a paid connector (verify before relying on this). Not zero-cost. Rejected unless the licence question changes. |

Option A is the fallback that needs no new runtime.

---

## 4. What cannot be automated easily, and the manual fallback

| Step | Why it is hard | Manual fallback |
|---|---|---|
| Creating Power Automate flows from code | May need admin rights or a premium licence (verify before relying on this). | Ship flow definitions as export packages the owner imports. Or ship numbered click steps, as `docs/setup-guide.md` does for Google. Whether import works on a personal account needs checking (verify before relying on this). |
| Turning on flows and setting their time zone | Same as above | The owner sets the time zone on each flow during setup. |
| Creating Microsoft Forms from code | Forms may have no create API on a personal account (verify before relying on this). | Print the generated question list and build the form by hand. |
| Entra ID app registration and consent | Work or school tenants can require admin consent. Personal accounts have different rules (verify before relying on this). | Document the exact permissions. The owner or an admin consents by hand. |
| Premium connectors (for example HTTP or custom connectors) | Usually paid (verify before relying on this). | Do not use them. Stick to standard connectors only, and confirm the list for the chosen account type. |
| Power BI report sharing | Sharing can need a paid licence (verify before relying on this). | Keep reporting out of the first version. |
| The "Activate" step | There is no direct equivalent of a one-click, bound-script Activate (see 2). | A numbered setup sheet, with each flow and table created in order. |

---

## 5. Zero-cost rule and licensing

PLAN.md section 3a and ADR 0005 apply to this design. The project will not buy or link a paid Microsoft plan, and it will not create a paid tenant or licence.

| Part | Likely licence need | Project stance |
|---|---|---|
| Excel for the web, Microsoft Forms, Outlook.com, OneDrive | Free with a personal Microsoft account, for basic use (verify before relying on this) | Allowed. This is the zero-cost path to test. |
| Power Automate, standard connectors | Free tier covers some connectors on some accounts (verify before relying on this) | Allowed only for the connectors the free tier covers. Confirm each one. |
| Power Automate, premium connectors | Paid (verify before relying on this) | Not built. Documented as "skip". |
| Office Scripts | Depends on the account (verify before relying on this) | Allowed only if the free path covers it. |
| Microsoft 365 business plans, SharePoint Lists in a work tenant | Paid (verify before relying on this) | Not built. |
| Power BI sharing | Paid for sharing (verify before relying on this) | Not built. |
| Microsoft Entra ID tenant | Free tier exists (verify before relying on this) | Only if the free tier allows the needed app registration. |

Account creation is a human-only step (PLAN.md section 9b). The team does not create Microsoft accounts.

---

## 6. Effort estimate

Relative sizes only. No time or cost figures are given, and none has been measured.

| Work item | Size | Why |
|---|---|---|
| Workbook template: one table per log, validation, hidden plan sheet | S | Direct mapping (section 2) |
| Choosing and testing the validator runtime (section 3.3) | M | Open question with unknown runtime limits |
| Routing flow | S to M | Clean in principle, multi-select convention needed |
| Follow-up reminder flow with per-flow time zone | M | Time zone handling and daylight saving checks |
| Weekly digest flow | M | Grouping logic must be re-implemented or ported |
| Alerts with submitter identity | M | Depends on the table type and identity field |
| Forms: generated question list and manual steps | S | Fallback path |
| Consent and licence documentation | S | Mostly research, marked verify |
| Whole adapter, tested in a real Microsoft account | L | Sum of the above, plus test accounts |

Overall: **L**. This is an estimate from the work items above, not from a build.

---

## 7. Open questions for Aaron

1. Is the zero-cost path (personal Microsoft account, free tiers only) enough to test the design, or does the design need a work tenant? The second needs a human decision (PLAN.md section 9b, item E).
2. Should the first Microsoft version be workbook and flows only, with no sidebar?
3. Is the validator option A (validate in the web app, pass a checked plan) acceptable for a first version?
4. Should the optional prototype (section 8) be approved?
5. Which Microsoft account type will be used for any test, and who creates it?

---

## 8. Optional stretch (not approved, not started)

A small prototype could create an Excel workbook with one table per log through Microsoft Graph. It would show whether the table mapping in section 2 holds. It needs Aaron's approval (PLAN.md Phase 5). It must stay on free accounts and must not use any paid API. Whether Graph calls are free for the chosen account type is unknown (verify before relying on this).
