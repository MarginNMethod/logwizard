# LogWizard privacy notice

Status: draft, 2026-10-11. Replace the contact placeholder before this page is used on the Google OAuth consent screen.

LogWizard helps a small team set up an interaction log in their own Google account. This page says what the app stores, what it never stores, and how it handles the optional AI key.

---

## The short version

- **We do not keep your plan, your answers, your emails, or your spreadsheet.** Your log lives in your own Google account.
- **The only data kept on our server** is anonymous timing and count information, plus request counters for rate limiting.
- **That data is deleted after 90 days.**
- **An AI key you paste stays in your browser's memory.** It is never saved or logged.

---

## What we collect

| Data | What it is | Why we keep it | How long |
|---|---|---|---|
| Session ID | A random code made for one visit. It is not linked to your name or email. | To group the timing steps of one visit | 90 days |
| Step name and duration | Which step of the setup you reached, and how many milliseconds it took | To measure how long setup takes | 90 days |
| Check result | Whether a plan passed validation (`pass`, `fail`, or `retry_pass`) and how many retries were needed | To measure how well the planner works | 90 days |
| Timestamp | When the step happened | To group results by day | 90 days |
| Visitor key (hashed) | A scrambled code for one visitor. It is used only to count requests in a time window. | To limit how many requests one visitor can send | 90 days |
| Window start and request count | When a counting window began and how many requests were in it | To block abuse | 90 days |

Hashed means the stored value is scrambled and cannot be read back. It is still an identifier for counting requests, so we treat it as personal data and delete it on the same schedule.

---

## What we never collect

We never store any of the following on our server:

- Email addresses, yours or anyone else's (owners, contributors, or reviewers)
- Interview answers
- Plans, in any form
- Names of organizations, employers, donors, students, or clients
- Links to your spreadsheet, your Google Form, or your Drive files
- Google access tokens

Interview answers stay in your browser for the length of the session. They are not saved after the session ends.

---

## Your data stays in your Google account

When you set up a log, the app creates these things in your own Google account:

- The log spreadsheet, its tabs, and its entries
- The Google Form that contributors use, and its responses
- The Activity tab, which records problems in plain language
- Reminder and alert emails, which are sent from your Gmail account

You control these. You can open, edit, share, or delete the spreadsheet and the Form in Google Drive at any time.

The app asks Google only for the permissions it needs to create and set up these items. Google shows the list on its permission screen before you click Allow. The app does not ask for access to your whole Drive or your whole Gmail.

---

## Bring your own AI key (optional)

Some visitors want to try their own answers with an AI model. To do this, they can paste their own AI provider key.

- **The key stays in your browser's memory** for that visit only. It is not written to a file, a database, or a log.
- **It is sent only as part of the request** that needs it.
- **Closing the page clears the key.**
- **Replay mode needs no key.** It uses recorded example plans and does not contact any AI service.

The project's tests check that the key is never stored or logged: an automated test confirms it never appears in logs, error messages, or responses, even when the underlying error text contains it. This was tested against a mock of the AI service only, not a real call.

---

## Other things to know

- The app does not show advertising.
- The project does not add third-party analytics. The only data kept is the list in "What we collect."
- The database is hosted by Supabase on its free plan. The app keeps working when the database is paused or unreachable. In that case, timing data is simply not saved.
- Reminder emails use your Gmail sending limit. Google sets that limit, and the app warns you in the Activity tab when you get close to it.

---

## Your choices

- **Delete your log.** Delete the spreadsheet and the Form in Google Drive. The app keeps nothing else about it.
- **Ask what we hold.** Write to the contact address below. We will tell you what is stored about the anonymous data, which is only the list in "What we collect."

---

## Contact

Privacy questions: `contact@example.com` (placeholder, replace before publishing).

---

## Changes

We will update this page if the data we collect changes. The date at the top shows the latest draft.
