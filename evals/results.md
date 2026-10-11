# Eval results

Planner prompt version: v1

> **How these were produced.** Every recording graded here was produced by Claude Code subagents running `evals/planner-prompt.md` and the plan schema on Aaron's existing Claude Code plan. **No paid Anthropic API was called**, and these numbers are not API measurements. They describe the planner prompt and the plan schema. The runner reads recordings from disk only; it makes no network calls and needs no API key.

## Summary

- Personas: 12. Recorded: 12. Not recorded yet: 0.
- Valid on first try: 12 of 12 recorded.
- Valid after one retry (includes first-try passes): 12 of 12 recorded.
- Matches expected with no diff issues: 11 of 12 recorded.
- Reply envelope (notes within the 200 character cap, at most 2 follow-up questions, no extra keys): 11 of 12 recorded pass. 1 fail. This is checked separately from plan validity, so a recording can be valid and still fail here.
- Clean on both the diff and the envelope: 10 of 12 recorded.
- Invented features: 0. Missing features: 0.
- The denominator is recorded personas only (12), not all 12. Target (PLAN.md): all personas valid after one retry and zero invented features, which can be claimed only once every persona has a recording.

## Per persona

| Persona | Result | Valid on | Envelope | Missing | Invented | Notes |
|---|---|---|---|---|---|---|
| career-center | pass | first try | ok | - | - | - |
| church-volunteers | pass | first try | ok | - | - | - |
| eight-areas | pass | first try | ok | - | - | - |
| forty-fields | pass | first try | FAIL | - | - | - |
| nonprofit-donors | pass | first try | ok | - | - | - |
| odd-time-zone | pass | first try | ok | - | - | - |
| prompt-injection | pass | first try | ok | - | - | - |
| realestate-leads | pass | first try | ok | - | - | - |
| sms-whatsapp | pass | first try | ok | - | - | - |
| solo-no-contributors | pass | first try | ok | - | - | - |
| teacher-parent-contacts | pass | first try | ok | - | - | - |
| vague-user | differs from expected | first try | ok | - | - | wrong: follow_up_reminder (days_before 0, expected 1 or 2 or 3 or 7) |

## Envelope failures

**forty-fields**
- unsupported_requests[0]: Unsupported request note must be at most 200 characters

## Notes and limits

- Recording dates: 2026-10-11 to 2026-10-11.
- The diff is mechanical (evals/README.md, Diff rules). It checks features, counts, days, time zone, required field labels, refusals, limits, forbidden strings, and formula or code artefacts. It cannot judge whether extra fields are sensible, so fields beyond the required labels are not counted as invented.
- The runner recomputes validation with the real validator and flags any recording whose recorded validation block disagrees.
- Each persona has one recording, so these results show what one run produced, not how often the prompt succeeds.

## Reading these results honestly (lead notes)

This section is hand-written (evals/results-notes.v1.md) and appended by the runner, so regenerating this file keeps it. Its numbers match the run above.

- **How these were made.** Claude Code workers followed `planner-prompt.md` v1 on each persona's answers, without seeing the `expected` block. They planned inline, not in isolated fresh subagents, so this is a weaker measurement than the design intends. No paid API was called.
- **First-try valid 12/12, diff-clean 11/12, envelope-ok 11/12, clean on both 10/12.** Two recordings have a problem:
  - `vague-user` (diff): the planner chose `days_before: 0` after the answer "I guess so?"; the key expects 1, 2, 3, or 7. The v1 prompt gives no default for a vague answer. This is a real prompt gap. `planner-prompt.v2.md` adds a default of 1 with a note; it still needs fresh v2 recordings to show it works.
  - `forty-fields` (envelope): the `unsupported_requests` note that lists the omitted fields is over the 200 character cap. The plan itself is valid and the diff passes, but `validatePlannerReply` rejects the reply, so the real app would treat it as a failed first try. This is a real planner or prompt gap that the plan-only check did not show. v2 tightens the instruction; it needs fresh v2 recordings to show it works.
- **The answer key was loosened for `career-center`, not the planner.** The first run showed "differs from expected" because the plan labels the field "Organization name" while the key demanded "Organization". The persona's own answer says "Organization name", so copying the person's wording is correct planner behavior. The key now accepts either wording through `field_label_alternatives`. This change moved career-center from differs-from-expected to pass, so the diff-clean count rose from 10 to 11 because of the key, not because the planner changed. The planner prompt was not edited for this.
- **Not a pass-rate claim.** One run per persona, same context as the guide, a small set made by the same author as the prompt. It shows the prompt and validator work together on these 12 cases. It does not show how a different planner or real users would do.
- **v2 has no recordings yet.** `node --import ./src/register.mjs src/run.ts --version v2` reports all 12 as not recorded. Making them needs fresh planner runs (see RECORDING-GUIDE.md, "Making v2 recordings").
