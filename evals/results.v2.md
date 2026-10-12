# Eval results

Planner prompt version: v2

> **How these were produced.** Every recording graded here was produced by Claude Code subagents running `evals/planner-prompt.md` and the plan schema on Aaron's existing Claude Code plan. **No paid Anthropic API was called**, and these numbers are not API measurements. They describe the planner prompt and the plan schema. The runner reads recordings from disk only; it makes no network calls and needs no API key.

## Summary

- Personas: 12. Recorded: 12. Not recorded yet: 0.
- Valid on first try: 12 of 12 recorded.
- Valid after one retry (includes first-try passes): 12 of 12 recorded.
- Matches expected with no diff issues: 12 of 12 recorded.
- Reply envelope (notes within the 200 character cap, at most 2 follow-up questions, no extra keys): 12 of 12 recorded pass. 0 fail. This is checked separately from plan validity, so a recording can be valid and still fail here.
- Clean on both the diff and the envelope: 12 of 12 recorded.
- Invented features: 0. Missing features: 0.
- The denominator is recorded personas only (12), not all 12. Target (PLAN.md): all personas valid after one retry and zero invented features, which can be claimed only once every persona has a recording.

## Per persona

| Persona | Result | Valid on | Envelope | Missing | Invented | Notes |
|---|---|---|---|---|---|---|
| career-center | pass | first try | ok | - | - | - |
| church-volunteers | pass | first try | ok | - | - | - |
| eight-areas | pass | first try | ok | - | - | - |
| forty-fields | pass | first try | ok | - | - | - |
| nonprofit-donors | pass | first try | ok | - | - | - |
| odd-time-zone | pass | first try | ok | - | - | - |
| prompt-injection | pass | first try | ok | - | - | - |
| realestate-leads | pass | first try | ok | - | - | - |
| sms-whatsapp | pass | first try | ok | - | - | - |
| solo-no-contributors | pass | first try | ok | - | - | - |
| teacher-parent-contacts | pass | first try | ok | - | - | - |
| vague-user | pass | first try | ok | - | - | - |

## Notes and limits

- Recording dates: 2026-10-11 to 2026-10-11.
- The diff is mechanical (evals/README.md, Diff rules). It checks features, counts, days, time zone, required field labels, refusals, limits, forbidden strings, and formula or code artefacts. It cannot judge whether extra fields are sensible, so fields beyond the required labels are not counted as invented.
- The runner recomputes validation with the real validator and flags any recording whose recorded validation block disagrees.
- Each persona has one recording, so these results show what one run produced, not how often the prompt succeeds.

## Reading these results honestly (lead notes, prompt v2)

- **How these were made.** Twelve fresh Claude Code subagents, one per persona, each given only the text below the `---` line of `planner-prompt.v2.md` plus that persona's answers, in a single scratch file. They were told to read only that file. The tooling did not enforce this, so isolation is stronger than v1 (where planning ran in the recording worker's own context) but is not airtight. The lead validated each reply with the real validator and wrote the recordings with a script, so no plan was edited. No paid API was called.
- **Result: 12/12 valid on the first try, 12/12 diff-clean, 12/12 reply-format OK, 0 invented, 0 missing, 0 retries.**
- **This is not evidence that the planner generalises.** The v2 prompt was written after seeing the v1 results on these same 12 personas, and two of its changes target the two v1 problems directly: the 200 character note cap (the `forty-fields` envelope failure) and "vague reminder answer means 1 day before" (the `vague-user` miss). Fixing a prompt against the set that exposed the problem and then scoring it on that set is in-sample tuning. The honest claim is "the v1 problems are fixed", not "the planner passes 12 of 12".
- **The answer key for `career-center` was loosened** (not the planner) to accept "Organization name", as noted in `results-notes.v1.md`. That change is still in effect here.
- **One run per persona.** There is no measure of run-to-run variation.
- **What would make this stronger.** New personas written after v2 is frozen, ideally by someone other than the prompt author, run once each, with the results reported whatever they are.
