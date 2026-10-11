# Traceability

Status: skeleton, 2026-10-11. Each requirement in `docs/requirements.md` is linked to the user stories in `docs/user-stories.md` that cover it.

The **Planned test** and **Status** columns are TBD. No tests exist yet. The Phase 1 and later build fills them in, and each test gets a file path when it is written.

How to read this table:

- **User stories** lists the story IDs (O = owner, C = contributor, V = reviewer).
- **Planned test** names the test that will prove the requirement. It is TBD until the test exists.
- **Status** is TBD until a test passes against the built system.

---

## Functional requirements

| ID | Requirement | User stories | Planned test | Status |
|---|---|---|---|---|
| R-1 | The interview collects the ten topics in `PLAN.md` section 5, in under 10 minutes. | O-1 | TBD | TBD |
| R-2 | The AI turns answers into a plan that follows the schema. Invalid plans get one automatic retry, then a friendly error. | O-2, V-3 | TBD | TBD |
| R-3 | The validator enforces every limit and rule in `PLAN.md` section 4. | O-2, V-2 | TBD | TBD |
| R-4 | The preview shows the plan in plain English without AI, and lets the owner edit before approving. | O-3, V-1 | TBD | TBD |
| R-5 | The owner can download the plan as JSON. | O-4 | TBD | TBD |
| R-6 | Demo mode runs the interview, plan, and preview without Google sign-in and ends at a view-only sample. | V-1 | TBD | TBD |
| R-7 | On approval, the app creates the sheet in the owner's Google Drive and writes the plan into it. | O-5 | TBD | TBD |
| R-8 | The engine builds one tab per log, with headers, dropdowns, and date checks. | O-6 | TBD | TBD |
| R-9 | Contributors add entries through a generated Google Form. The owner can also use a sidebar. | O-7, C-1 | TBD | TBD |
| R-10 | Entries are routed to other logs by rule, without duplicates. | O-8 | TBD | TBD |
| R-11 | A daily check sends follow-up reminders. A weekly digest is optional. | O-9 | TBD | TBD |
| R-12 | The owner gets an alert when a contributor adds an entry. | O-10, C-3 | TBD | TBD |
| R-13 | Re-running Activate never creates duplicate triggers or deletes data. | O-11 | TBD | TBD |
| R-14 | Errors appear in plain language on an `Activity` tab and in the app. | O-12 | TBD | TBD |

## Non-functional requirements

| ID | Requirement | User stories | Planned test | Status |
|---|---|---|---|---|
| N-1 | Privacy: server-side storage is limited to anonymous funnel metrics and rate-limit counters, deleted after 90 days. No emails, answers, plans, or sheet links. | O-15, V-5 | TBD | TBD |
| N-2 | Security: AI output is validated before use. User-entered cell values are written as plain text. Secrets stay in environment variables. | C-2, V-2 | TBD | TBD |
| N-3 | Least privilege: smallest workable Google scopes, with no restricted scopes. | O-5, V-5 | TBD | TBD |
| N-4 | Zero cost: free plans only, no billing account, no purchased domain, no server-side AI key. The app and its tests work with no AI key set. | O-14, V-6 | TBD | TBD |
| N-5 | Accessibility: the web app meets WCAG 2.1 AA. | V-4 | TBD | TBD |
| N-6 | Reliability: email use stays within the daily limits (100 per day for personal accounts, 1,500 per day for Workspace, per `SPIKES.md`). | O-13 | TBD | TBD |
| N-7 | Testability: schema and engine decision logic are pure functions with unit tests. The AI step has an eval set with automatic pass criteria. | V-3, V-6 | TBD | TBD |

---

## Coverage check

- Every functional requirement (R-1 to R-14) has at least one user story.
- Every non-functional requirement (N-1 to N-7) has at least one user story.
- Stories that appear in more than one row (for example O-7 and C-1 for R-9) cover the same requirement from two roles.
- Requirement IDs are not renumbered. A new requirement gets the next free ID and a new row here.
