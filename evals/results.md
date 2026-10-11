# Eval results

Planner prompt version: v1

> **How these were produced.** Every recording graded here was produced by Claude Code subagents running `evals/planner-prompt.md` and the plan schema on Aaron's existing Claude Code plan. **No paid Anthropic API was called**, and these numbers are not API measurements. They describe the planner prompt and the plan schema. The runner reads recordings from disk only; it makes no network calls and needs no API key.

## Summary

- Personas: 12. Recorded: 12. Not recorded yet: 0.
- Valid on first try: 12 of 12 recorded.
- Valid after one retry (includes first-try passes): 12 of 12 recorded.
- Matches expected with no diff issues: 10 of 12 recorded.
- Invented features: 0. Missing features: 1.
- The denominator is recorded personas only (12), not all 12. Target (PLAN.md): all personas valid after one retry and zero invented features, which can be claimed only once every persona has a recording.

## Per persona

| Persona | Result | Valid on | Missing | Invented | Notes |
|---|---|---|---|---|---|
| career-center | differs from expected | first try | field: required field label not found: Organization | - | - |
| church-volunteers | pass | first try | - | - | - |
| eight-areas | pass | first try | - | - | - |
| forty-fields | pass | first try | - | - | - |
| nonprofit-donors | pass | first try | - | - | - |
| odd-time-zone | pass | first try | - | - | - |
| prompt-injection | pass | first try | - | - | - |
| realestate-leads | pass | first try | - | - | - |
| sms-whatsapp | pass | first try | - | - | - |
| solo-no-contributors | pass | first try | - | - | - |
| teacher-parent-contacts | pass | first try | - | - | - |
| vague-user | differs from expected | first try | - | - | wrong: follow_up_reminder (days_before 0, expected 1 or 2 or 3 or 7) |

## Notes and limits

- Recording dates: 2026-10-11 to 2026-10-11.
- The diff is mechanical (evals/README.md, Diff rules). It checks features, counts, days, time zone, required field labels, refusals, limits, forbidden strings, and formula or code artefacts. It cannot judge whether extra fields are sensible, so fields beyond the required labels are not counted as invented.
- The runner recomputes validation with the real validator and flags any recording whose recorded validation block disagrees.
- Each persona has one recording, so these results show what one run produced, not how often the prompt succeeds.


## Reading these results honestly (lead notes)

- **How these were made.** Claude Code workers followed `planner-prompt.md` v1 on each persona's answers, without seeing the `expected` block. They planned inline, not in isolated fresh subagents, so this is a weaker measurement than the design intends. No paid API was called.
- **First-try valid 12/12, diff-clean 10/12.** Two recordings differ from the answer key:
  - `career-center`: the plan labels the field "Organization name"; the key expects "Organization". This looks like an over-strict label match in the key, not a planner error. The key was not changed to make the run pass.
  - `vague-user`: the planner chose `days_before: 0` after the answer "I guess so?"; the key expects 1, 2, 3, or 7. The prompt gives no default for a vague answer. This is a real prompt gap to fix in prompt v2 and then re-record.
- **Not a pass-rate claim.** One run per persona, same context as the guide, a small set made by the same author as the prompt. It shows the prompt and validator work together on these 12 cases. It does not show how a different planner or real users would do.
