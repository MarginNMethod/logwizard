# 0004: Supabase holds anonymous metrics only

Status: accepted. Date: 2026-10-11.

## Context
The first draft had no database. The case study needs measured numbers, and the public AI endpoint needs rate limiting.

## Decision
Use a new dedicated Supabase project with two tables: `funnel_events` and `rate_limits`. No personal data is stored. Row Level Security is on, only the server writes, and rows are deleted after 90 days.

## Why
- Gives real timings and pass rates for the case study.
- Keeps the privacy story simple: no user records leave the user's Google account.

## Consequences
A privacy page is needed (`docs/privacy.md`). Migrations are reviewed before they are applied.
