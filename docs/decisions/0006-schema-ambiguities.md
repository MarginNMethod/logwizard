# 0006: How Phase 1 resolved gaps in the plan schema

Status: accepted. Date: 2026-10-11.

## Context
`PLAN.md` section 4 left some details open. `schema-dev` made choices while building `packages/plan-schema`. This record keeps them in one place. Changing any of them later is a schema change and needs a decision record, a critic sign-off, and updated tests.

## Text-safety rule
After trimming, every plan string (names, labels, options, routing values, notify entries, emails) must be 1 to its length cap and is rejected if it starts with `=` or `@`, starts with `+` or `-` directly followed by a digit or `(`, or contains a control character. So `- Other -` and `+ Add new` are allowed; `-5`, `+1 phone`, and `=SUM(A1)` are not. The engine still writes every cell as plain text, because the rule does not catch cases like `+SUM(...)`.

## Resolved gaps
1. Plan-level arrays default to empty. At least one log is required, and a base log needs at least one field.
2. A log has either `fields` or `copy_fields_from`, never both and never neither.
3. Unknown properties are rejected everywhere.
4. Single-value enums: contributor `role` is "contributor", alert `on` is "new_entry", alert `when_entered_by` is "contributor".
5. `days_before` is a whole number from 0 to 30. `day` is MON to SUN. Reminder types are `follow_up_due` and `weekly_digest`.
6. `time_zone` is `UTC` or a `Region/City` name accepted by Intl, with exact capitalization. Offsets and abbreviations are rejected.
7. Only `choice` and `multi_choice` fields have options. Duplicate options are rejected, ignoring case.
8. Added uniqueness: log ids, log names (ignoring case, since they become tab names), and contributor emails.
9. A routing source log must have its own fields. A routing target must copy fields from the rule's `from` log. Chains are rejected.
10. A `follow_up_due` reminder on a copy log resolves its `date_field` through the source log.
11. `notify` lists have 1 to 10 entries. "contributors" is an error when the plan has none. An email target must be the owner or a contributor.
12. Length caps: 80 characters for names and labels, 60 for options, 254 for emails, 40 for keys and ids.

## Consequences
The planner prompt (`evals/planner-prompt.md`) lists these rules so plans pass on the first try.
