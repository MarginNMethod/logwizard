# Setup guide: the steps only Aaron can do

Audience: Aaron. Plain language, click by click.

This guide covers the human-only steps in `PLAN.md` section 9b (H0 to H3) and the launch sequence in section 9a. The agent team does everything else.

Status: draft. Google and Vercel menu labels change often. Where a label is uncertain, the step says so. Read the screen, and if a label is different, look for the closest match and note the difference in `docs/OPEN_ITEMS.md`.

---

## 1. Who does what, and why

Some steps must be done by you. The team cannot do them on your behalf, for these reasons:

- **Accounts and sign-in.** Creating or signing in to Google, Vercel, Supabase, and GitHub needs your password or your login approval.
- **Google permission prompts.** Google asks a person, not a program, to click Allow.
- **Money decisions.** Any step that could create a charge is yours to decide. The default answer is **skip**.
- **Secrets.** Keys and passwords go into `.env.local` and Vercel settings, typed by you. They never go into chat.

| Step | Time | Who | Why only you |
|---|---|---|---|
| H0: accounts and keys | About 30 min, once | You | Accounts, passwords, billing check |
| H1: approve the plan | About 5 min | You approve, the team creates the projects on free plans | Your approval is the permission to create the LogWizard projects |
| H2: Google hands-on | About 15 to 20 min | You | Google sign-in and Allow prompt in the test account |
| H3: final timed run | About 20 min | You | You run the full flow with a timer |
| Launch sequence | About 10 min, once | You | Settings changes, typing the `/goal` command, setting the budget |

### Rules that apply to every step

- **No billing.** Do not link a billing account, add a card, or upgrade any plan.
- **No secrets in chat.** Never paste a password, key, or token into chat or into a file other than `.env.local`.
- **Test account only for testing.** Use a separate Google account for the test runs, not your work account.
- **Policy check first.** Confirm your employer's outside-work and intellectual property policy allows this personal project (item A in `PLAN.md` section 9b). Only you can decide this.

---

## 2. H0: Accounts and keys (about 30 minutes, once)

Do the steps in order.

### Step 1: Confirm the policy and pick a name (item A)

1. Read your employer's outside-work and intellectual property policy. Decide whether this project is allowed.
2. Pick the final project name. The working name is LogWizard. You can change it later, but the OAuth consent screen uses it, so decide before Step 3.

### Step 2: Create a Google Cloud project with no billing account (item B)

1. Open https://console.cloud.google.com and sign in with **your own Google account**.
2. Click the project picker at the top of the page, then **New project**.
3. Name it (for example, `logwizard`). Click **Create**.
4. Check billing. Open the navigation menu (three lines), then search for **Billing**.
   - If the project shows **no billing account**, you are done with this step.
   - If Google asks you to add a billing account or a card, **stop and skip**. Do not add one. The project works without billing for this use.
5. Unverified: the exact menu names for billing may differ. The goal is only that no billing account is linked to this project.

Why only you: this needs your Google sign-in, and billing is a money decision.

### Step 3: Set up the OAuth consent screen in testing mode (item B)

Google has been moving this area. The current console may show a section called **Google Auth Platform**, with pages such as **Branding**, **Audience**, and **Data Access**. Unverified: I could not confirm the current labels. Use the closest match to the names below.

1. In the console, go to **APIs & Services**, then **OAuth consent screen** (or **Google Auth Platform**).
2. **User type:** choose **External**. Choose it even though you are the owner. Internal is only for Google Workspace organizations.
3. **App name:** the name from Step 1.
4. **User support email and developer contact:** your own email address.
5. **App logo:** skip.
6. **Application home page and privacy policy link:** leave blank for now. Come back after the team has published the privacy page (see `docs/privacy.md`). The team will give you the exact URL.
7. **Scopes:** add only the permissions the team lists for you. Do not add extra ones. The provisional list is in `SPIKES.md` (Spike 7) and `PLAN.md` section 6. Unverified: the final list is not confirmed until Spike 7 is tested.
8. **Test users:** add the address of your separate test Google account (Step 5). The audit notes a limit of 100 test users in testing mode. Unverified: confirm the number on the screen.
9. **Publishing status:** keep it at **Testing**. Do not click **Publish app**. Do not submit for verification. Both are out of scope for this project.

Notes:
- Testing mode is the right setting for this project. Only the test users you list can sign in.
- Unverified: Google has documented shorter sign-in lifetimes for apps in testing mode. If the test sign-in stops working after a few days, sign in again and note it in `docs/OPEN_ITEMS.md`.

### Step 4: Create the OAuth client ID (item B and C)

1. Go to **APIs & Services**, then **Credentials**.
2. Click **Create credentials**, then **OAuth client ID**.
3. **Application type:** **Web application**.
4. **Authorized redirect URIs:** the team will give you the exact address once the sign-in route exists. Leave this step open until then.
5. Click **Create**. Google shows a **client ID** and a **client secret**.
6. Copy both into `.env.local` (Step 8). Do not paste them into chat.

Unverified: the web app needs Google's Drive and Sheets APIs enabled in this project, and possibly the Forms API. Enable them under **APIs & Services**, then **Library**, only if the team confirms they are needed.

### Step 5: Create a separate test Google account (item B)

1. Create a new Gmail address for testing. Do not use your work address. Choose a neutral name.
2. Write the address in your password manager. Do not write it in this repository. This guide uses the placeholder `logwizard-test@example.com` only to show where it goes.
3. Sign in to the new account once and finish the first-time prompts.

Why only you: creating an account and setting its password are yours to do.

### Step 6: Turn on the Apps Script API in the test account (item B)

1. Sign in to the **test account** (not your own account).
2. Open https://script.google.com.
3. Open **Settings** (the gear icon), and turn on **Google Apps Script API**.
4. Unverified: the exact label and where it sits may differ. The setting must be on in the test account, not in your own account.

### Step 7: Confirm the free plans and create the GitHub repository (items C and D)

**Vercel Hobby**

1. Open https://vercel.com and sign in.
2. Open your account or team **Settings**, then find **Plan** or **Billing**.
3. Confirm it says **Hobby**. If it says anything else, do not upgrade. Downgrade or ask the team in `docs/OPEN_ITEMS.md`.
4. Unverified: the page name may differ.

**Supabase Free**

1. Open https://supabase.com and sign in.
2. Open the organization settings, then **Billing** or **Plan**.
3. Confirm the plan is **Free**. Do not add a payment method.
4. Supabase Free projects pause after a period of inactivity. This is expected. The app works without them (`PLAN.md` section 3a).

**GitHub repository**

1. Create a new repository on GitHub. Visibility is your choice.
2. Do not push code yourself yet. The team does not push either. You or the lead push or approve the first push (item D).
3. Connect Vercel to this repository when the team is ready (Vercel dashboard, then **Add New**, then **Project**, then import the repository). Do not add a custom domain. Do not attach a paid add-on.

### Step 8: Put secrets in `.env.local`

The file `.env.example` in the repository has placeholder values. Make your own copy.

1. In the repository folder, run:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` in a text editor. Fill in these lines with the values you created:

   | Name | Where the value comes from | Notes |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | Step 4 | Client ID |
   | `GOOGLE_CLIENT_SECRET` | Step 4 | Treat as a password |
   | `SUPABASE_URL` | Supabase project settings, for the **LogWizard** project | Must be the new LogWizard project, not "Development" |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase API settings, for the LogWizard project | Server-side only. Treat as a password |
   | `GOOGLE_TEMPLATE_FILE_ID` | Filled in later, during H2 | Leave the placeholder until the team says the template exists |

3. Leave `AI_MODE=replay` as it is. Leave `ANTHROPIC_API_KEY` empty or commented out. The default path costs nothing and needs no AI key (`docs/decisions/0005-zero-cost.md`).
4. Save the file.
5. Confirm Git ignores it. Run this from the repository folder:

   ```bash
   git check-ignore -v .env.local
   ```

   Expected result: one line that names `.gitignore` and `.env.local`. This was checked on the current `.gitignore` (it matches the rule `.env.*`). If the command prints nothing, stop and tell the team.

6. Copy the same values into Vercel. In the Vercel project, open **Settings**, then **Environment Variables**, and add each name and value. Unverified: the exact menu labels may differ.

Never open `.env.local` in a shared screen or paste it into chat.

### Step 9: Confirm the checklist

- [ ] Policy check and project name decided (Step 1)
- [ ] Google Cloud project created with no billing account (Step 2)
- [ ] OAuth consent screen in testing mode, test user added, not published (Step 3)
- [ ] OAuth client ID and secret created (Step 4)
- [ ] Separate test Google account created (Step 5)
- [ ] Apps Script API turned on in the test account (Step 6)
- [ ] Vercel shows Hobby, Supabase shows Free, GitHub repository created (Step 7)
- [ ] `.env.local` filled in, and `git check-ignore` shows it (Step 8)

---

## 3. H1: Approve the plan (about 5 minutes)

1. Read `PLAN.md`. Confirm you approve it.
2. Approval also allows the team to:
   - install the tools (pnpm, esbuild, clasp)
   - create the LogWizard Supabase project, only if the team confirms the plan is Free
   - create the Vercel project
3. Check the team's report on the Supabase plan before you move on. If it says anything other than Free, stop.

Why only you: approving the plan is your decision.

---

## 4. H2: Google hands-on (about 15 to 20 minutes, after Phases 1 and 2)

You do this in the **test Google account** only. The team writes the exact numbered script before the session. The outline:

1. Open the **Make a copy** link the team gives you. Make a copy of the template sheet.
2. Open the copy. Click the menu named for the system, then **Activate**.
3. Click through Google's permission prompt. Click **Allow** only for the permissions the team listed.
4. Submit one test entry through the generated Google Form.
5. Send the results (screenshots, the `Activity` tab, and what you saw) back to the team.

Why only you: this is a Google sign-in and a permission prompt, which the team cannot click through for you.

---

## 5. H3: Final timed run (about 20 minutes, after Phases 3 and 4)

1. Open the run sheet and the one-page checklist the team prepares.
2. Start a timer. Begin at the interview, and stop when a reminder email arrives.
3. Follow the checklist without outside help.
4. Write down the time and the number of manual steps for `docs/case-study.md`.

Target from `PLAN.md`: under 20 minutes total.

Why only you: the timing must be a real run by you, not a review.

---

## 6. Launch sequence for the agent team (about 10 minutes, once)

Do these steps in this order, after H0 and H1 are done.

### Step 1: Turn on agent teams

The setting is not on today. It was checked against `~/.claude/settings.json` on 2026-10-11, and the name `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` does not appear there.

1. Open `~/.claude/settings.json` in a text editor.
2. Add this entry. If the file already has an `"env"` block, add the line inside it. Do not overwrite the other settings.

   ```json
   {
     "env": {
       "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
     }
   }
   ```

3. Save the file. Start a new Claude Code session so the setting loads. Unverified: the team has not confirmed whether a restart is required.

### Step 2: Generate project guidance (once, in the repository)

In Claude Code, with the repository open, type:

```
/oh-my-claudecode:deepinit
```

Run it once.

### Step 3: Create the goals

The `omc` command was **not** found on the PATH when this guide was written. Install or confirm the OMC command line first. Then run, from the repository folder:

```bash
omc ultragoal create-goals --brief-file PLAN.md
```

This creates one goal per phase. The output includes a handoff message with an objective.

### Step 4: Set the goal (you type it)

Type `/goal` in Claude Code, followed by the aggregate objective that the handoff message printed.

Only you can do this. The agent cannot set it for you.

### Step 5: Set the token budget before launch

The budget is the one cost that cannot be zero. `PLAN.md` does not set a number, so the choice is yours. Set it in your shell before starting Claude Code:

```bash
export OMC_RUN_BUDGET_TOKENS=<your number>
```

What the team does with it:
- At 90 percent, the team finishes the current phase.
- At 100 percent, the team stops and saves state. A relaunch resumes.

Record the number you chose in `docs/OPEN_ITEMS.md`.

### Step 6: Start the team

Type this in Claude Code:

```
/oh-my-claudecode:team ralph "Execute PLAN.md phase by phase using the roster in section 9a"
```

### Checks before you start

- [ ] `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set to `1` in `~/.claude/settings.json`
- [ ] `/oh-my-claudecode:deepinit` has run once
- [ ] `omc` is installed and the goals exist
- [ ] `/goal` is set, typed by you
- [ ] `OMC_RUN_BUDGET_TOKENS` is set to a number you chose
- [ ] H0 and H1 are finished

---

## 7. Where questions go

The team records every decision that belongs to you in `docs/OPEN_ITEMS.md`, with the assumption it is working under. Answer them in that file or in chat. Do not paste secrets.

---

## 8. What this guide could not verify

These items are unverified. Check them on your screen before relying on them.

- Current Google Cloud menu labels (Google Auth Platform, OAuth consent screen, Billing).
- The exact list of OAuth scopes (Spike 7 is partly answered).
- Whether the Drive, Sheets, or Forms APIs must be enabled in the Google Cloud project.
- The number of test users allowed in testing mode (the audit notes 100).
- How long test sign-ins last in testing mode.
- The location of the Apps Script API setting in the test account.
- Vercel and Supabase menu labels for plan and environment variables.
- Whether restarting Claude Code is needed after the settings change.
- The `omc` command was not on PATH when this guide was written.
- The budget number is not set anywhere in the plan.
