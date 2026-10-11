# 0007: Schema hardening after independent review

Status: accepted. Date: 2026-10-11. Amends 0006.

## Context
An independent `reviewer` pass on Phase 1 found two high and seven medium issues, each confirmed by a failing input: a quadratic email check (a 50,000 character input took about 4 seconds), error amplification on oversized plans (60 MB of errors, then out of memory), time zones that depended on the runtime's ICU data, tab-name clashes with engine tabs, invisible Unicode characters, echoed unbounded values, prototype-style keys, and commas in multi-select options.

## Decision
Every finding was fixed, tests first (70 new tests failed before the fixes). Rule changes, old to new:

1. Email regex made linear, and every refinement returns early past the length cap.
2. Input over 64 KB of JSON gets one error. Cross-checks run only after the object-level parse succeeds. Errors are capped at 25 plus "and N more problems". No message echoes an options list.
3. `time_zone` is checked against a pinned allowlist of about 400 canonical `Region/City` names plus `UTC`, max 64 characters. Legacy names (`US/Eastern`, `Asia/Calcutta`, `Europe/Kiev`), `Etc/*`, wrong case, and offsets are rejected. The summary uses a pinned display-name table, so output is identical on every runtime.
4. Log names `_plan`, `setup`, `activity`, `entries`, `form responses 1`, and any name starting with `_` are rejected, ignoring case.
5. Text is NFKC-folded, then rejected if it contains control, format, surrogate, private-use, or line and paragraph separator characters. Duplicate checks use the folded text. The zero-width joiner is rejected too, so some compound emoji are not allowed.
6. Echoed values are cut to 40 characters. At most 5 unknown keys are listed.
7. Keys and ids reject `__proto__`, `constructor`, `prototype`, `hasOwnProperty`, `toString`, `valueOf`, `entry_id`, `entered_by`, `entered_at`.
8. Options may not contain a comma.
9. New cross-checks: at most one weekly digest; an alert needs a contributor; the owner cannot also be a contributor; no duplicate routing rules; no duplicate `notify` entries; no duplicate field labels in a log.
10. Sign rule changed to reject a leading `+` or `-` unless followed by a space or the end of the string. `+SUM(A1)`, `-A1`, `+1 phone`, `-5` are rejected; `- Other -` and `+ Add new` stay valid.
11. A runtime schema for the planner reply (`PlannerReplySchema`) with length caps and the same text rule.

## Consequences
- The engine must still write every cell as plain text, because the text rule is a second layer, not the only one.
- A few legitimate inputs are now rejected (compound emoji, comma options). The planner prompt tells the AI how to avoid them.
- Unassigned Unicode characters are not rejected. Revisit if it matters.
