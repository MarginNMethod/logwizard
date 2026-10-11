# Demo script: 3-minute walkthrough (Demo mode)

Status: script for recording. Not yet recorded. The timings below are a plan for pacing, not measurements.

**Placeholder notice.** The recorded Google walkthrough (Activate, Form, and reminder email) does **not exist yet**. The demo ends with a placeholder where that link will go. Do not describe the Google part as shown until it is recorded. The app marks both links as placeholders until they are published (`apps/web/lib/placeholders.ts`, `WALKTHROUGH_URL` and `SAMPLE_SHEET_URL` are both `null`).

---

## Before you record

| Item | Check |
|---|---|
| Run the app in demo mode | `pnpm install`, then `pnpm --filter @logwizard/web dev`. Open `http://localhost:3000`. No keys are needed. |
| Use no API key | Do not paste a key. Demo mode uses recorded plans. |
| Use the sample persona | Pick **University career center tracking employer outreach** from the **Sample person** list. Its recorded plan passed on the first try (`evals/results.md`). |
| Window size | Desktop width. Close other tabs. |
| Sample data | Only `example.com` addresses appear in the sample. Do not add a real name or email. |

---

## The script

Timings are planned: 0:00 to 3:00. Narration is in plain language. Stage directions are in *italics*.

### 0:00 to 0:20. Open

**Narration:** "This is LogWizard. You describe how your team tracks interactions, in plain words. It turns your answers into a setup plan, shows you the plan, and only then builds anything. The AI writes a plan, not code."

*Show the home page. Click **Try Demo mode**.*

### 0:20 to 0:45. Choose a sample and answer the interview

**Narration:** "Demo mode needs no sign-in and no key. I will use a sample: a university career center tracking employer outreach."

*On **Start the interview**, choose the sample person from the dropdown. All ten answers fill in. Click **Begin the interview**. Click **Next** to move through two or three questions. Point at "Question 3 of 10".*

**Narration:** "There are ten questions. The answers can be edited, and each one shows how many characters you have used out of the limit."

*Click **Next** until question 10. Click **Create my plan**.*

### 0:45 to 1:05. The plan is checked before you see it

**Narration:** "The planner returns a plan in a fixed format. The app checks it against a set of rules before it shows it to you. This one passed on the first try."

*Point at the line "passed on the first try" on **Review your plan**.*

### 1:05 to 1:40. Read the plan in plain English

**Narration:** "This summary is written by the app, not the AI. It is generated from the plan, so the summary always matches the rules."

*Scroll the summary. Read one sentence about the logs, and one about the reminder or the alert. Point at **Things I left out**.*

**Narration:** "Anything the planner could not do is listed here. This sample has nothing left out."

### 1:40 to 2:15. Edit a label and see the check

**Narration:** "You can change the plan before anything is built. Each change is checked right away."

*In **Edit your plan**, change one field label, for example add "(new)" to the end. Show "Your plan passes all checks."*

*Clear that same label so it is empty. Show the red box that explains the problem in plain language, and show that **Approve and finish demo** is now disabled. Type the label back. Show that both buttons are enabled again.*

**Narration:** "A bad edit cannot be approved. The check tells you what is wrong."

### 2:15 to 2:40. Download and approve

**Narration:** "You can download the plan as a file. It is plain JSON, and you can keep it."

*Click **Download plan as JSON**. Show the file name in the download bar.*

*Click **Approve and finish demo**.*

### 2:40 to 3:00. End, and what comes next

**Narration:** "In the full version, the next step builds a spreadsheet, a form for contributors, and the reminders in your own Google account. This demo does not build anything. It ends at a view-only sample."

*On the end page, show the two items marked **PLACEHOLDER**: "View-only sample sheet" and "Recorded walkthrough of Activate and reminders". Say:*

**Narration:** "These two links are placeholders. The walkthrough of the Google build has not been recorded yet, so this demo does not show it."

*Close on the end page. Show the **privacy notice** link if time allows, or stop here.*

---

## After recording

| Item | Action |
|---|---|
| Walkthrough link | When the Google walkthrough exists, set `WALKTHROUGH_URL` in `apps/web/lib/placeholders.ts` and republish. Do not record it in this pass. |
| Sample sheet link | Publish the view-only sample sheet, then set `SAMPLE_SHEET_URL`. |
| Measured timings | The timings above are a plan. Replace them with the real timings from the recording, and say so. |
| Eval wording | If the demo mentions the eval numbers, quote `evals/results.md` as it reads on the day, with the caveats in `docs/test-plan.md` section 4.4. |
