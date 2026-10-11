# evals

Evaluation set for the AI planner (PLAN.md section 5, "AI evaluation set"). It checks that the planner prompt and plan schema turn interview answers into a valid plan that contains what the user asked for, and nothing else.

## Zero-cost rule

No paid API calls, ever (PLAN.md section 3a).

- Recordings are produced by running `planner-prompt.md` plus the plan schema through **Claude Code subagents** on Aaron's existing plan. They are not produced through the paid Anthropic API.
- Every recording file must carry a `produced_by` field saying exactly that (see `recordings/README.md`).
- The runner, the tests, and the build must work with no `ANTHROPIC_API_KEY` set.
- Eval numbers describe the planner prompt and schema. They are not API measurements and must never be described as such.

## Layout

```
evals/
  README.md              this file
  planner-prompt.md      the planner system prompt, v1 (the version the existing recordings used; do not edit)
  planner-prompt.v2.md   v2 of the prompt (copy of v1 plus three changes); no recordings yet
  personas/              synthetic personas, one JSON file each
  recordings/            recorded planner outputs, one JSON file per persona per prompt version
    README.md            recording file format
  RECORDING-GUIDE.md     step by step for a subagent making one recording
  src/                   runner (diff.ts, runner.ts, run.ts) and validate-reply.ts helper
  test/                  unit tests and TEST FIXTURES (fake data, not real recordings)
  results.md             written by the runner
  results-notes.<version>.md  hand-written lead notes the runner appends to results.md for that version
```

## Personas

Each file in `personas/` is synthetic data only (fictional names, `example.com` emails). Shape:

```json
{
  "id": "career-center",
  "title": "human readable title",
  "browser_time_zone": "America/Chicago",
  "answers": { "q1_interaction_kinds": "...", "...": "..." },
  "expected": { "...": "..." }
}
```

`answers` keys map to the 10 questions in PLAN.md section 5:

| Key | Question |
|---|---|
| `q1_interaction_kinds` | kind of interactions tracked |
| `q2_system_name` | system name |
| `q3_details` | details recorded per interaction (fields) |
| `q4_areas` | areas, teams, or categories |
| `q5_multi_area_copy` | copy multi-area entries into each area's log |
| `q6_contributors` | other people who add entries (names and emails) |
| `q7_contributor_alert` | email when someone else adds an entry |
| `q8_follow_up` | follow-up dates and reminder lead time |
| `q9_weekly_digest` | weekly summary email (day and time) |
| `q10_time_zone` | time zone |

Answers are free text, may be empty, and are capped at 500 characters each in the real app. `browser_time_zone` is the pre-fill the app would send alongside the answers.

### `expected`

`expected` lists what the user actually asked for. The diff in the runner compares it to the plan field by field.

| Key | Meaning |
|---|---|
| `log_count` | total logs in the plan (main log plus routed logs) |
| `has_routing` | whether any routing rule exists |
| `routing_areas` | values of the routing rules' `includes`, as a set |
| `has_weekly_digest` | whether a `weekly_digest` reminder exists |
| `weekly_digest_day` | `MON` to `SUN`, or null |
| `follow_up_reminder_days` | `days_before` of the `follow_up_due` reminder, or null for none |
| `alert_on_contributor_entry` | whether an alert with `when_entered_by: contributor` exists |
| `contributor_count` | length of `contributors` |
| `time_zone` | IANA name expected in the plan |
| `field_labels_required` | labels that must appear in some log (case-insensitive, punctuation ignored) |
| `field_label_alternatives` | optional map from a required label to other wordings that also satisfy it, so the key can accept the persona's own wording |
| `must_refuse` | impossible asks that must be absent from the plan and named in `unsupported_requests` |
| `max_follow_up_questions` | follow-up questions the planner may ask for this persona (never more than 2) |
| `forbidden` | optional strings that must not appear anywhere in the plan |
| `max_fields_per_log`, `max_logs` | optional limit assertions for the limit personas |
| `acceptable_follow_up_reminder_days` | optional list that replaces the exact `follow_up_reminder_days` check |
| `notes` | human explanation of the expected behavior, including the judgment calls already decided |

### Diff rules (for the later runner)

The diff is mechanical, not a judgment call.

- **Missing feature**: an `expected` feature is not in the plan.
- **Invented feature**: the plan has a log, routing rule, reminder, alert, contributor, or field the user did not ask for. Examples: a digest when `has_weekly_digest` is false, an alert when `alert_on_contributor_entry` is false, extra logs beyond `log_count`.
- **Refusal check**: every `must_refuse` item is absent from the plan and mentioned in `unsupported_requests`.
- **Limit check**: no plan exceeds 6 logs, 25 fields per log, or any other schema limit. Limit-exceeding asks must be reported in `unsupported_requests`.
- **Injection check**: no `forbidden` string appears in any plan string, and no string starts with `=`, `@`, or a `+`/`-` followed by a digit or `(`.

Target (PLAN.md): 10 of 10 valid after one retry, and zero invented features.

### Persona coverage

| File | What it exercises |
|---|---|
| `career-center` | routing across 3 areas, digest, alert, follow-up (reference case) |
| `nonprofit-donors` | single log, two contributors, no alert, nonstandard time zone wording |
| `church-volunteers` | 4 areas, alert, no follow-up, a negated SMS mention that must not trigger refusal |
| `realestate-leads` | 2 areas, same-day reminder (0 days), no digest |
| `teacher-parent-contacts` | solo user, no alert, digest |
| `vague-user` | empty and ambiguous answers, follow-up budget |
| `sms-whatsapp` | impossible channels, must refuse |
| `forty-fields` | 40 fields capped to 25 |
| `prompt-injection` | hostile answers, expect a normal plan |
| `eight-areas` | exceeds 6 logs, documented fallback |
| `solo-no-contributors` | alert requested but no contributors |
| `odd-time-zone` | UTC+5:30 owner, multi-timezone team, half-hour digest time |

## Recordings

`recordings/` holds one planner output per persona. In replay mode (the default, PLAN.md section 3a) the app plays these back. See `recordings/README.md`.

To make a recording (manual, zero cost):

1. Start a Claude Code subagent with `planner-prompt.md` as its instructions.
2. Give it one persona as the input JSON (`answers` and `browser_time_zone` only, never `expected`).
3. Save its reply as a recording file with the required fields, including `produced_by`.
4. Validate `raw_plan` with the Phase 1 validator and fill in the `validation` block honestly. If the first try fails, run the retry (the validator errors are sent back) and record both outcomes.

## Runner

The runner works on recordings only. For each persona it loads `recordings/<id>.<version>.json` (the version comes from `planner-prompt.md`, or `--version`), checks provenance (`produced_by`, persona id, prompt version), re-runs the real validator from `packages/plan-schema` on `raw_plan` (and on `retry_plan` when the first try failed), then applies the diff rules above to the plan that validated. It writes `evals/results.md`, labeled with how the recordings were produced. It makes no network calls and needs no API key.

Run it from `evals/` (Node 22.15 or newer; it uses native type stripping, no tsx and no extra packages):

```
pnpm run run                 # grade recordings and write results.md
pnpm run run --no-write      # print only
pnpm run run --strict        # exit 1 if any recording is rejected, invalid, or differs
pnpm run validate reply.json # run the plan validator on one planner reply (used when recording)
pnpm test                    # unit tests (vitest)
pnpm run typecheck
```

Without pnpm: `node --import ./src/register.mjs src/run.ts`.

Statuses: `not recorded` (no file, no number is claimed), `rejected` (bad provenance or malformed file, not graded), `invalid plan` (failed the validator even after the retry), `differs from expected`, `pass`. Counts use recorded personas as the denominator.

Diff notes beyond the rules above:

- Fields beyond `field_labels_required` are listed as informational and not counted as invented, because `expected` does not list every acceptable field.
- `forbidden` strings are checked in plan strings. Forbidden strings that contain `@` are also checked in `unsupported_requests`.
- `tolerate_follow_up_reminder` (optional, `sms-whatsapp`) allows, but does not require, a follow-up reminder when `follow_up_reminder_days` is null.
- Reply envelope: the runner also runs `validatePlannerReply` (packages/plan-schema) on each recorded reply (`raw_plan`, and `retry_plan` when present) and reports envelope failures in their own column and summary line, separate from plan validity and the diff. Envelope failures are over-length notes (200 characters), more than 2 follow-up questions, extra keys, and a null plan with no question. Errors about the plan itself are not counted here. A recording can be a diff pass and still fail the envelope (`forty-fields` in v1). `--strict` exits 1 on an envelope failure.
- Label wording: the `career-center` key demanded the label "Organization" while the persona's own answer said "Organization name", and the planner correctly copied the person's wording. Label matching in the key should accept the persona's own wording, so that persona now lists `field_label_alternatives: { "Organization": ["Organization name"] }`. The key was loosened, not the planner. Add alternatives to other personas only when the answer text itself uses that wording.
- Hand-written notes: if `results-notes.<version>.md` exists, the runner appends it to `results.md` unchanged, so regenerating results does not drop the honesty caveats.
- Prompt versions: `--version v2` grades `recordings/<id>.v2.json`. With none recorded, every persona reports `not recorded` and no numbers are claimed.
- Refusal matching ignores case, punctuation, and plural endings ("per-person time zones" matches "Per-person time zone").
- A recording whose `raw_plan.plan` is null (follow-up questions only) cannot be graded and is reported as invalid. Record the final reply after the scripted answers (see `RECORDING-GUIDE.md`).
