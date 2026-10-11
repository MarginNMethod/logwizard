# GATE 1 report: Phase 1 plan schema and validator

Date: 2026-10-11. Type: AUTO-GATE.

## Result
Pass after one fix loop (see Review below).

## Checks run by the lead (independent of the worker's report)
| Check | Result |
|---|---|
| `pnpm -r test` | 97 tests pass in `plan-schema`. `engine-logic` has no tests yet (configured to pass with none). |
| `pnpm --filter @logwizard/plan-schema typecheck` | Clean |
| Tests with `ANTHROPIC_API_KEY` unset | Pass (zero-cost guard) |
| Em dash scan (md, ts, json, sql) | None |
| Addresses other than `example.com` | None |
| Secret scan of tracked files | None |

## Acceptance (PLAN.md Phase 1)
- All tests pass: yes.
- The section 4 example plan validates: yes (fixture `valid-example`; note the example now includes `time_zone` and routing `from`).
- Each rule has a failing fixture: yes. 50 invalid fixtures, each checked for its error path and message.
- `plainEnglishSummary(plan)` is deterministic and has no AI dependency: yes.

## Review
An independent `reviewer` found 2 high and 7 medium issues (quadratic email check, error amplification to out-of-memory, runtime-dependent time zones, tab-name clashes, invisible Unicode, and others). All were fixed in a second pass, tests first (70 new failing tests, then green). Details in `docs/decisions/0007-schema-hardening.md`. Re-verification by the lead after the fix: 201 schema tests, 85 engine tests, 30 eval tests pass; 11 adversarial probes written by the lead all behave as required (hostile email under 500 ms, `Etc/GMT+5`, `US/Eastern`, a log named `Setup`, a zero-width space before `=`, `__proto__` key, comma in an option, `+SUM(A1)` are all rejected; `- Other -` and `Asia/Kolkata` are accepted). The fixes themselves have not had a second independent review.

## Not yet done
- The planner prompt was updated to match the validator, but no recording has been produced yet, so nothing confirms that real planner output passes first time.

## Decisions
See `docs/decisions/0006-schema-ambiguities.md`.
