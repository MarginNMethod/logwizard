## Reading these results honestly (lead notes, prompt v2)

- **How these were made.** Twelve fresh Claude Code subagents, one per persona, each given only the text below the `---` line of `planner-prompt.v2.md` plus that persona's answers, in a single scratch file. They were told to read only that file. The tooling did not enforce this, so isolation is stronger than v1 (where planning ran in the recording worker's own context) but is not airtight. The lead validated each reply with the real validator and wrote the recordings with a script, so no plan was edited. No paid API was called.
- **Result: 12/12 valid on the first try, 12/12 diff-clean, 12/12 reply-format OK, 0 invented, 0 missing, 0 retries.**
- **This is not evidence that the planner generalises.** The v2 prompt was written after seeing the v1 results on these same 12 personas, and two of its changes target the two v1 problems directly: the 200 character note cap (the `forty-fields` envelope failure) and "vague reminder answer means 1 day before" (the `vague-user` miss). Fixing a prompt against the set that exposed the problem and then scoring it on that set is in-sample tuning. The honest claim is "the v1 problems are fixed", not "the planner passes 12 of 12".
- **The answer key for `career-center` was loosened** (not the planner) to accept "Organization name", as noted in `results-notes.v1.md`. That change is still in effect here.
- **One run per persona.** There is no measure of run-to-run variation.
- **What would make this stronger.** New personas written after v2 is frozen, ideally by someone other than the prompt author, run once each, with the results reported whatever they are.

## Held-out run (2026-10-12)

- **What was added.** Five new personas (`ho-*`) with answer keys, written and committed (`18834ab`) before any planning run, with the v2 prompt frozen (sha256 `280df20e...`). Each was planned once by a fresh subagent given only the v2 prompt text and that persona's answers, then validated with the real validator. No plan was edited and no retries ran.
- **Result on the held-out five: 5/5 valid on the first try, 5/5 diff-clean, 5/5 reply-format OK, 0 invented, 0 missing.** Combined with the original twelve: 17/17 on every measure in `results.v2.md`.
- **What this adds.** The five personas were not seen when the prompt was tuned, so this answers the in-sample objection for these scenarios: a clinic with routing, a plan with no routing and no digest, a team with no contributor emails (no contributors invented), unsupported Slack and chart requests (both refused and listed), and a Berlin time zone with comma-bearing answers.
- **Limits that remain.** Five cases is small. The personas, answer keys and prompt were all written by the same assistant, so the test is not independent of the prompt author. Each persona ran once, so there is no measure of run-to-run variation. Isolation was by instruction, not enforced by the tooling. `ho-team-no-emails` expected the planner to ask for the emails; it did not ask, and instead omitted contributors and said so in `unsupported_requests`, which the diff accepted. The claim is "held-out cases passed", not "the planner is reliable".

