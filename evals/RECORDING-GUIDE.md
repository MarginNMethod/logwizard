# Recording guide

How a Claude Code subagent produces ONE recording file for ONE persona. No paid API is used at any step. Do not set or read `ANTHROPIC_API_KEY`.

Output file: `evals/recordings/<persona-id>.<version>.json`, for example `evals/recordings/career-center.v1.json`. The file format is in `recordings/README.md`.

## Inputs

- `evals/planner-prompt.md`: the planner system prompt. Read the version from its first line (`planner_prompt_version: v1`).
- `evals/personas/<persona-id>.json`: use ONLY `answers` and `browser_time_zone`. Never read, quote, or use `expected` or `notes` while producing the plan. The planner must not see grading information.
- `packages/plan-schema` (the validator). It is run through a helper, shown below.

## Steps

Run every command from `evals/`.

1. **Pick one persona.** Note its `id` and the prompt version `<version>`. If `recordings/<id>.<version>.json` already exists, stop: never overwrite a recording. Make a new one only after the prompt version changes.

2. **Build the planner input.** Create this JSON in your scratch folder (not in the repo):

   ```json
   {
     "answers": { "...copied from the persona's answers..." },
     "browser_time_zone": "...copied...",
     "owner": { "name": "Sample Owner", "email": "owner@example.com" },
     "follow_ups_used": 0,
     "follow_up_answers": {}
   }
   ```

   Copy `answers` exactly, including hostile or odd text. Do not clean it up.

3. **Run the planner as a fresh subagent.** Start a new Claude Code subagent whose instructions are the text below the `---` line in `planner-prompt.md`, and whose only input is the JSON from step 2. It must not be given the persona's `expected` block, the README, other recordings, or this guide. Do not do the planning yourself in the same context.

4. **Save its reply unmodified.** Write the subagent's complete reply to `<scratch>/first.json`. It should be one JSON object `{ "plan", "follow_up_questions", "unsupported_requests" }`. If the reply is not parseable JSON, `raw_plan` cannot hold it. In that case set `raw_plan` to `{ "plan": null, "follow_up_questions": [], "unsupported_requests": [] }`, describe what happened in `notes`, and treat the run as a first-try failure (use "reply was not valid JSON" as the error in step 6).

5. **Validate the first try with the real validator.**

   ```
   pnpm run validate <scratch>/first.json
   ```

   It prints `VALID`, or `INVALID` and the error lines. This result decides `first_try_pass`. Do not judge it yourself.

   - `VALID`: `validation` is `{ "first_try_pass": true, "retried": false, "retry_pass": null }`. Skip to step 8.
   - `INVALID`: go to step 6.
   - If `plan` is `null` because the planner asked follow-up questions: answer them with short, in-character scripted answers drawn only from the persona's `answers` text (never from `expected`). Re-run step 3 with `follow_ups_used` set to the number of questions asked and `follow_up_answers` filled in (keys are the question text). Record those answers in `follow_up_answers` in the file. Use the final reply as the first try.

6. **Retry once.** Start another fresh subagent with the same instructions and the same input JSON plus a `validation_errors` array containing the exact error lines from step 5. Save its reply to `<scratch>/retry.json` and run:

   ```
   pnpm run validate <scratch>/retry.json
   ```

   Set `validation` to `{ "first_try_pass": false, "retried": true, "retry_pass": <true if VALID, else false> }`. Put the retry reply in `retry_plan`. Never retry more than once.

7. **Do not edit any plan.** `raw_plan` and `retry_plan` are the subagents' replies, byte for byte in content. If a plan is wrong, record that in `notes`. Do not fix it.

8. **Write the recording file** with these fields:

   | Field | Value |
   |---|---|
   | `persona_id` | the persona `id` |
   | `produced_by` | exactly `Claude Code subagent run of evals/planner-prompt.md (no paid API call)` |
   | `date` | today, `YYYY-MM-DD` |
   | `planner_prompt_version` | the version from step 1 |
   | `raw_plan` | the first reply |
   | `validation` | from step 5 or 6 |
   | `retry_plan` | only if a retry ran |
   | `follow_up_answers` | only if the planner asked questions |
   | `notes` | one or two plain sentences: anything odd, which model the subagent used if known. No grading opinions. |
   | `tokens`, `duration_ms` | only if the run reported them. Otherwise leave them out. Never estimate. |

   Use synthetic data only. Do not add an `expected` field or any grading information.

9. **Check the file.** From `evals/`:

   ```
   pnpm run run --no-write
   ```

   Your persona's line must not say `rejected`, and must show no `flag:` lines. A `flag` means the `validation` block you wrote disagrees with the real validator; fix the `validation` block (never the plan). The diff lines that follow show how the plan compares with `expected`. They are for the lead, not for you to fix: do not re-run the planner to get a better result, and do not change the plan.

10. **Report back** the file path, whether it passed on the first try or after the retry, and any `flag` lines. Do not run `pnpm run run` without `--no-write` unless asked; the lead regenerates `evals/results.md`.

## Rules

- One persona, one file, one version. Never overwrite an existing recording.
- The subagent that plans must not see `expected`.
- No network calls, no paid API, no API key.
- Do not describe these results as API measurements.
- Do not commit.


## Practical notes from the first recording run

- Run the runner with stdin closed, or it can hang: `cd evals && node --import ./src/register.mjs src/run.ts --no-write </dev/null | cat`. Several runs at once make `pnpm run run` very slow.
- Isolation caveat: in the first run (2026-10-11) the recording workers planned inline, in the same context that read this guide. They saw only the prompt and the persona `answers`, never `expected`, but the planner was not a separate fresh subagent. Each recording says so in `notes`. A stricter run would use one fresh subagent per persona that is given only the prompt and the answers JSON.
- The word "subagent" in `produced_by` is therefore a loose fit for the first run. Do not change the sentence (the runner checks it); explain the difference in `notes` and in the results.

## Making v2 recordings (fresh subagent per persona)

v2 recordings must be made differently from the v1 run: the planner has to be a truly separate agent. Nothing in `evals/` creates them; this needs fresh planner runs on Aaron's Claude Code plan (no paid API).

Inputs: `evals/planner-prompt.v2.md` (its first line says `planner_prompt_version: v2`), and each persona's `answers` and `browser_time_zone`.

For each of the 12 personas, do the following, one persona per subagent:

1. Check `evals/recordings/<id>.v2.json` does not already exist. Never overwrite.
2. Build the answers JSON exactly as in step 2 above (answers, browser_time_zone, sample owner, `follow_ups_used: 0`, `follow_up_answers: {}`). Do not clean up hostile or odd text.
3. Start a NEW subagent (Agent tool, a new instance, not a continued one and not an inline role-play). Its entire input is two things and nothing else: the text below the `---` line in `planner-prompt.v2.md` (as its instructions) and the answers JSON (as its message). Do not give it this guide, the README, `expected`, `notes`, `results.md`, the v1 prompt, any recording, or any other persona's data. Do not give it file access to `evals/personas/` if the tool setup allows limiting that. Spawn the 12 subagents so that none sees another's output (parallel or sequential, but never one subagent doing several personas).
4. Save its reply unmodified, then follow steps 4 to 8 above (validate with `pnpm run validate`, one fresh retry subagent if the first try is invalid, never edit a plan).
5. In the recording file set `planner_prompt_version` to `v2` and add the field `"isolation": "fresh-subagent"`. Only set it when step 3 was followed exactly. If any step was done inline, set `"isolation": "inline"` instead and say why in `notes`. Never leave it out of a v2 file.
6. Run `pnpm run run --no-write --version v2` and check the persona line (no `rejected`, no `flag:` lines). The Envelope column must be read too: an envelope FAIL is a result, not something to fix.
7. When all 12 exist, the lead runs `pnpm run run --version v2` to write `results.md` (this overwrites the v1 results; copy them first if needed, or write a `results-notes.v2.md`).

The `notes` field should say, in plain words: which model the subagent used if known, that it was a fresh subagent given only the v2 prompt text and the answers JSON, and anything odd. No grading opinions.
