# 0002: The AI writes a plan, not code

Status: accepted. Date: 2026-10-11.

## Context
The system runs scripts in the user's own Google account. An AI mistake there could affect real data or send real email.

## Decision
The AI only produces a JSON plan. A fixed, tested engine reads the plan and does the work.

## Why
- A bad plan is caught by schema validation and the human preview.
- A bad script would run with the user's permissions.
- Interview answers are untrusted input and could try to steer the AI.

## Consequences
Features must be added to the schema and the engine by hand. That is slower, and it is the point.
