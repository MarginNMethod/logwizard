# Eval results

Planner prompt version: v1

> **How these were produced.** Every recording graded here was produced by Claude Code subagents running `evals/planner-prompt.md` and the plan schema on Aaron's existing Claude Code plan. **No paid Anthropic API was called**, and these numbers are not API measurements. They describe the planner prompt and the plan schema. The runner reads recordings from disk only; it makes no network calls and needs no API key.

## Summary

- Personas: 12. Recorded: 0. Not recorded yet: 12.
- No recordings have been graded, so there are no pass counts. No number is claimed for personas without a recording.

## Per persona

| Persona | Result | Valid on | Missing | Invented | Notes |
|---|---|---|---|---|---|
| career-center | not recorded | - | - | - | - |
| church-volunteers | not recorded | - | - | - | - |
| eight-areas | not recorded | - | - | - | - |
| forty-fields | not recorded | - | - | - | - |
| nonprofit-donors | not recorded | - | - | - | - |
| odd-time-zone | not recorded | - | - | - | - |
| prompt-injection | not recorded | - | - | - | - |
| realestate-leads | not recorded | - | - | - | - |
| sms-whatsapp | not recorded | - | - | - | - |
| solo-no-contributors | not recorded | - | - | - | - |
| teacher-parent-contacts | not recorded | - | - | - | - |
| vague-user | not recorded | - | - | - | - |

## Notes and limits

- The diff is mechanical (evals/README.md, Diff rules). It checks features, counts, days, time zone, required field labels, refusals, limits, forbidden strings, and formula or code artefacts. It cannot judge whether extra fields are sensible, so fields beyond the required labels are not counted as invented.
- The runner recomputes validation with the real validator and flags any recording whose recorded validation block disagrees.
- Each persona has one recording, so these results show what one run produced, not how often the prompt succeeds.
