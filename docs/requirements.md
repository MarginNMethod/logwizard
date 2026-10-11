# Requirements (draft)

Status: Phase 0 draft. Refined through Phase 6. IDs (R-1, R-2, ...) are used by `docs/traceability.md` later.

## Problem

Small teams track interactions (emails with employers, calls with donors, contacts with parents) in ad hoc spreadsheets. Good setups need routing between lists, reminders, and alerts, which means scripting most people cannot do. Aaron built one such system by hand five times for a university career center. Each build took hours of repeated work.

## Users

- **Owner.** Non-technical. Runs a program or small team. Owns the log, wants reminders and alerts.
- **Contributor.** Adds entries. Should not need training or technical steps.
- **Reviewer (portfolio).** A hiring manager who has a few minutes and no wish to sign into anything.

## Goals

- G-1. An owner goes from idea to a working log system in under 20 minutes.
- G-2. A reviewer can see the whole flow without a Google sign-in.
- G-3. The AI never produces anything that runs in a user's account.
- G-4. Every claim in the case study is a measured number.
- G-5. The project costs $0 to build and to run.

## Non-goals

Payments, multiple organizations, storing any user's plan or records on the server, SMS or chat notifications, AI-written code, mobile apps, a working Microsoft build.

## Functional requirements

- R-1. The interview collects the ten topics in `PLAN.md` section 5, in under 10 minutes.
- R-2. The AI turns answers into a plan that follows the schema. Invalid plans get one automatic retry, then a friendly error.
- R-3. The validator enforces every limit and rule in `PLAN.md` section 4.
- R-4. The preview shows the plan in plain English without AI, and lets the owner edit fields, options, and reminders before approving.
- R-5. The owner can download the plan as JSON.
- R-6. Demo mode runs the interview, plan, and preview without Google sign-in and ends at a view-only sample.
- R-7. On approval, the app creates the sheet in the owner's Google Drive and writes the plan into it.
- R-8. The engine builds one tab per log, with headers, dropdowns, and date checks.
- R-9. Contributors add entries through a generated Google Form. The owner can also use a sidebar.
- R-10. Entries are routed to other logs by rule, without duplicates.
- R-11. A daily check sends follow-up reminders. A weekly digest is optional.
- R-12. The owner gets an alert when a contributor adds an entry.
- R-13. Re-running Activate never creates duplicate triggers or deletes data.
- R-14. Errors appear in plain language on an `Activity` tab and in the app.

## Non-functional requirements

- N-1. **Privacy.** Server-side storage is limited to anonymous funnel metrics and rate-limit counters, deleted after 90 days. No emails, answers, plans, or sheet links.
- N-2. **Security.** AI output is validated before use. User-entered cell values are written as plain text. Secrets stay in environment variables.
- N-3. **Least privilege.** Smallest workable Google scopes, with no restricted scopes.
- N-4. **Zero cost.** The project costs $0 to build and run: free plans only, no billing accounts, no purchased domain, and no server-side AI key. The app and its tests work with no AI key set.
- N-5. **Accessibility.** The web app meets WCAG 2.1 AA.
- N-6. **Reliability.** Email use stays within the daily limits (100 per day personal, 1,500 per day Workspace, per `SPIKES.md`).
- N-7. **Testability.** Schema and engine decision logic are pure functions with unit tests. The AI step has an eval set with automatic pass criteria.

## Open questions

- Which template-copy method works under `drive.file` (Spike 1)?
- Does the Form reliably give the submitter's email on personal accounts (Spike 4)?
- Final project name.
