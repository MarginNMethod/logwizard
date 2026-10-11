# recordings

Recorded planner outputs. One file per persona per prompt version, named `<persona-id>.<planner_prompt_version>.json`, for example `career-center.v1.json`.

## Zero-cost rule

Recordings are produced by running `evals/planner-prompt.md` and the plan schema through **Claude Code subagents**. They are never produced through the paid Anthropic API. Every recording must carry a `produced_by` field that says exactly that. The replay mode, the eval runner, and the tests read these files and make no network calls.

The required value of `produced_by` is:

```
Claude Code subagent run of evals/planner-prompt.md (no paid API call)
```

A recording missing `produced_by`, or with any other value, is rejected by the runner.

## Recording file schema

A recording is a JSON object with these fields. All are required unless marked optional.

| Field | Type | Description |
|---|---|---|
| `persona_id` | string | `id` of the persona in `evals/personas/` |
| `produced_by` | string | Must be exactly the sentence above |
| `date` | string | ISO date (YYYY-MM-DD) the recording was made |
| `planner_prompt_version` | string | Version from the top of `planner-prompt.md`, for example `v1` |
| `raw_plan` | object | The planner's complete JSON reply, unmodified: `{ "plan": ..., "follow_up_questions": [...], "unsupported_requests": [...] }` |
| `validation` | object | See below |
| `notes` | string | Free text: anything odd about the run, what the human checked, model used if known |
| `retry_plan` | object, optional | The planner's reply after the validator errors were fed back. Present only when `retried` is true |
| `isolation` | string, optional for v1, required for v2 | `"fresh-subagent"` when a separate new subagent saw only the prompt text and the answers JSON; `"inline"` when the planning happened in the same context as the guide. v1 recordings predate this field and were all inline |
| `follow_up_answers` | object, optional | Scripted answers given to follow-up questions, if the planner asked any. Keys are the question text |
| `tokens` | object, optional | `{ "input": n, "output": n }` if the run reported them |
| `duration_ms` | number, optional | Wall-clock time of the run if known |

### `validation` object

| Field | Type | Description |
|---|---|---|
| `first_try_pass` | boolean | `raw_plan.plan` passed the schema validator with no changes |
| `retried` | boolean | A retry was run because the first try failed |
| `retry_pass` | boolean or null | Whether `retry_plan.plan` passed. Null if no retry was run |

Rules: if `first_try_pass` is true then `retried` is false and `retry_pass` is null. The recorded fields must come from running the real validator, not from a person's judgment. The runner recomputes them and flags any mismatch.

### Example

```json
{
  "persona_id": "career-center",
  "produced_by": "Claude Code subagent run of evals/planner-prompt.md (no paid API call)",
  "date": "2026-10-12",
  "planner_prompt_version": "v1",
  "raw_plan": {
    "plan": { "schema_version": 1, "system_name": "Employer Outreach Log" },
    "follow_up_questions": [],
    "unsupported_requests": []
  },
  "validation": { "first_try_pass": true, "retried": false, "retry_pass": null },
  "notes": "Truncated example; real files hold the full plan."
}
```

## Rules

- Never edit a recorded `raw_plan` by hand. If the plan is wrong, record that fact and fix the prompt, then make a new recording under the new prompt version.
- Never put `expected` or any grading information in the planner's input.
- Recordings contain synthetic data only.
