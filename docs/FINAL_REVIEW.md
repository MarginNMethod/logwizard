# Final review: README, case study and supporting docs

Date: 2026-10-12. Reviewer: the assistant, reading as a hiring manager who has not seen the project, then checking every claim against the repository.

## Verdict

Ready to show, with two honest caveats that the documents now state up front:

1. The web app is not yet connected to Google. The engine was proven by installing it by hand. A reader who expects "sign in with Google, get a system" will not find that, and the README and case study say so in the first screen.
2. The before-and-after setup times are not measured, so no time saving is claimed.

## How this was reviewed

1. Read `README.md`, `docs/case-study.md` and `docs/demo-script.md` end to end.
2. Re-ran `CI=1 pnpm -r test` and the Apps Script build to get today's numbers.
3. Searched every `.md` file for stale counts, scope counts and "pending" statements.
4. Checked every file path named in the README and case study exists.
5. Searched for em dashes (none) and for invented figures.

## What was wrong, and what I changed

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | README and case study said **441** tests and **52** Apps Script tests. Today it is **456** and **67**. | High (a wrong headline number) | Updated in `README.md`, `docs/case-study.md`, `docs/test-plan.md`. `docs/gates/GATE-2.md` is a dated report and is left as written. |
| 2 | README said Google behaviour was untested and Spikes 1 to 4 pending. In fact Activate, the Form, the sidebar, the digest and a follow-up reminder were run in real Google on 2026-10-12. | High (understated the strongest evidence) | Rewrote the status section as "proven offline / proven by hand / live / not done". Updated `SPIKES.md`, `docs/data-model.md`, `docs/traceability.md`, `docs/test-plan.md`. |
| 3 | README said the Supabase migrations were "not verified" as applied. They are applied and a live event was stored. | Medium | Updated. |
| 4 | Scope count said **5**. It is now **6** (`userinfo.email` was added after the real run showed the sidebar user was blank). | Medium | Updated in `apps-script/README.md`, `docs/data-model.md`, `docs/MICROSOFT_ADAPTER.md`, `docs/test-plan.md`. |
| 5 | The case study was a skeleton full of "TO MEASURE" and the eval used v1 only. | High for a hiring-manager reader | Rewrote it: a one-minute summary, what was built, what went wrong and what it taught, eval v1 and v2 with caveats, goals table, honest gaps. |
| 6 | There was no live link at the top of the README. | Medium | Added the demo URL as the first thing after the title. |
| 7 | `SPIKES.md` sections still said "Status. Pending" while the table above said otherwise. | Low | Section headers now point to the table and the hands-on results. |
| 8 | The README's old "Read this as of 2026-10-11" implied a snapshot. | Low | Dates now sit on each claim group. |

## Claims I verified against evidence

| Claim in the docs | Evidence |
|---|---|
| 456 tests | `CI=1 pnpm -r test`: 201 + 85 + 67 + 66 + 37 |
| Bundle 228.7 KB, 6 scopes, build check passes | `pnpm --filter @logwizard/apps-script build` output |
| Live demo returns 200 | `curl` to `/` and `/start` |
| Metrics write to Supabase on the live site | A test event posted to `/api/events` was stored, then deleted |
| Digest and follow-up emails sent once, no duplicates | Inbox screenshots, 11:08 PM and 11:13 PM |
| Permission list had five items | Screenshot of Google's consent screen |
| Formula bug found, fixed, re-tested | `SPIKES.md` follow-up section, and the sheet cell showing text |
| Owner entries recorded as the owner's email after the scope fix | Owner confirmed the sheet and saw no self-alert |
| Eval v1 and v2 numbers | `evals/results.md`, `evals/results.v2.md` |

## Risks a hiring manager could still find

1. **The missing connecting step.** This is the biggest. It is stated plainly, but a skeptical reader may still ask why it is not built. The honest answer is scope: the project proves the safe-planning idea and the engine, and Phase 4 is the next piece.
2. **The eval is in-sample.** The v2 prompt was tuned on the same 12 personas it was graded on. Stated in the case study. A held-out persona set would remove the objection.
3. **No video walkthrough or sample sheet.** The demo script exists, the recording does not. A short screen recording of the live demo and one real Google sheet would make the evidence easier to scan.
4. **"What I would do differently" is a draft.** It is written from the project record. It should be rewritten in the author's own words before the page is published.
5. **`docs/privacy.md` still has a placeholder contact address.** It must be replaced before the page is used anywhere official, such as an OAuth consent screen.
6. **Private repository.** The GitHub repo is private. A reader without access sees only the live site. Making it public, or sharing a read-only link, is a decision for the owner.

## What I did not review

- I did not re-read `PLAN.md`, `AUDIT.md`, `requirements.md`, `user-stories.md` or the decision records line by line. I only searched them for stale claims.
- I did not run an accessibility audit.
- I did not test the live demo flow beyond checking its pages respond and a sample plan validates.

## Recommended before publishing

1. Rewrite "What I would do differently" in the author's voice.
2. Replace the placeholder privacy contact.
3. Decide whether to make the repository public.
4. Record the 3-minute demo and add the link.
5. If possible, write 3 to 5 new personas, freeze the prompt, and re-run the eval to remove the in-sample caveat.
