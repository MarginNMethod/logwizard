# Narrated video script (about 4 minutes)

Status: script only, written 2026-10-12. The video has not been recorded. It replaces the Demo-mode-only script in `docs/demo-script.md`, which predates the Google setup path.

Rules for the recording:
- Say only what the screen shows. Where the script says "on screen", show it.
- Use the `example.com` sample. Do not show a real person's email, apart from your own account in the Google part, and blur or crop that if you prefer.
- Use a private window signed in to one Google account only. Two accounts make Google's sidebar fail.
- Read the numbers as written. Do not add a setup time. It has not been measured.

---

## Before you record (10 minutes)

1. Close other tabs and notifications. Set the browser to desktop width, about 1280 pixels.
2. Open `logwizard.vercel.app` in a private window signed in to your test account.
3. Do one full practice run first, so you know where the screen pauses (the Activate wait, the permission screen).
4. Have a fresh copy of the template ready to make on camera. Delete old copies first so the Drive list is clean.
5. Do not record the permission screen's account picker or any password entry. Pause the recording there, or cut it.

---

## The script

Narration is in plain language. Stage directions are in *italics*. Times are planned, not measured.

### 1. The problem (0:00 to 0:25)

*On screen: the home page.*

"I built an interaction log for a university career center five times by hand. Each one was a spreadsheet, an entry form, copies of entries between related logs, reminder emails and alerts. It took hours and the setup was easy to get wrong. LogWizard is my attempt to generate that setup from a conversation, safely."

### 2. The one idea (0:25 to 0:45)

*On screen: still on the home page, then click Try Demo mode.*

"The idea is that the AI writes a plan, not code. The plan is plain data. A strict checker validates it, and you read it in plain English before anything is built. A bad plan can be caught. A bad script would run with your own permissions, so I avoided that case entirely."

### 3. The interview (0:45 to 1:10)

*On screen: choose the sample "University career center tracking employer outreach". Click Begin the interview. Click Next through two questions, then jump to the last and click Create my plan.*

"Demo mode needs no sign-in and no key. There are ten plain questions. I'll use a sample answer set so you can try the same thing."

### 4. The plan, checked and in plain English (1:10 to 1:50)

*On screen: Review your plan. Point at "passed on the first try", then scroll the summary.*

"The planner returns a plan in a fixed format. The app checks it against its rules before showing it to me. This summary is written by the app, not the AI, so it always matches the plan underneath. Anything the planner could not do is listed under 'Things I left out'."

*Edit one label so it is empty. Show the red message and the disabled Approve button. Type the label back.*

"I can edit the plan. A bad edit cannot be approved, and the message says what is wrong."

### 5. Approve, and the three steps (1:50 to 2:15)

*On screen: click Approve and finish demo. Show the three steps.*

"Once approved, the page gives me three steps. Make a copy of a template sheet. Copy the plan. Paste it into the sheet. I chose this over signing in with Google because I tested the alternative: an app with the narrow Drive permission could not copy the template, Google answered 'not found'. This way the app asks for nothing and stores nothing."

### 6. The Google side (2:15 to 3:25)

*On screen: click Make a copy. On Google's page, point at the line about the attached Apps Script. Click Make a copy.*

"Google's own copy page says the script comes along. That's the engine."

*Back on the LogWizard tab, click Copy plan. In the sheet, open the LogWizard menu and click Paste your plan. Paste. Click Check plan.*

"Before saving, the sheet shows me the plan and a list of every email address it will send mail to. That list matters. A plan someone sends you could name addresses you don't know, so you read it first."

*Click Save this plan. Reload. Menu, then Activate.*

"Now Activate. Google asks for permission. This is the part I deliberately leave to the person. I'll pause here."

*Cut or pause during the account picker and the Allow clicks. Resume when the tabs appear.*

"Google lists exactly five permissions, none broad. No reading mail, no all-of-Drive, no contacts. The engine built the log tabs, the entry form and two timers."

*Add one entry from the sidebar. Show it in the log and the routed copy in the second log.*

"One entry. It landed in the main log and was copied to the matching one."

### 7. What went wrong, honestly (3:25 to 3:50)

*On screen: the case study page or the README section 'What went wrong'.*

"The part I'd want a hiring manager to hear. 456 offline tests passed, yet the first real Google run found a bug. A form answer of equals SUM A1 was evaluated as a formula, so anyone using the form could put formulas in my sheet. I fixed it, and made my fake Google behave that way so it stays tested. It happened again later: the paste box's script had a syntax error that no test ran. Now there are tests that run it. The lesson is that a fake is only as right as my understanding of the real thing."

### 8. What is and isn't proven (3:50 to 4:10)

*On screen: README, 'What is proven, and what is not'.*

"What I can claim: the engine and the paste path work in a real Google account, with tests on both. What I can't: the setup time is not measured, the AI planner has only run on recorded plans, the eval is small and written by me, and I haven't tested a Workspace account. Everything is free to run. No paid plan, no AI key on the server. The code is public. Thanks for watching."

---

## Pacing notes

- Speak slowly. About 130 words a minute is comfortable. This script is around 650 words.
- Do not read the screen text aloud. Say what it means.
- Cut dead time (waiting for Activate, permission screens). Do not speed up the screen so much that the viewer cannot follow.
- Add captions. Most people will watch without sound.

## After recording

- Upload to YouTube (unlisted) or any host, then set `WALKTHROUGH_URL` in `apps/web/lib/placeholders.ts` and republish.
- Update `docs/demo-script.md` and the README line that says the video does not exist.
