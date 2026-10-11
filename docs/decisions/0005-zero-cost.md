# 0005: The project costs nothing

Status: accepted. Date: 2026-10-11.

## Context
This is a portfolio project meant to show hiring managers how Aaron works. It is not a product, so spending money on it is not justified.

## Decision
No paid plans, paid APIs, purchased domains, or billing accounts. The AI planner runs in replay mode by default, using recorded plans. Visitors may bring their own API key to try their own answers. There is no server-side AI key.

## Why
- A public endpoint that spends the owner's money is a risk with no portfolio benefit.
- Replay mode lets any reviewer see the whole flow instantly and reliably.
- Free tiers (Vercel Hobby, Supabase Free, Google Cloud without billing) cover every other part.

## Consequences
- Custom answers need the visitor's own key. Without one, they pick a sample persona.
- Recorded plans are made through Claude Code subagents, not the paid API. Every recording says so, and the case study reports it plainly.
- Supabase Free projects can pause, so metrics are optional.
- The agent team's own usage runs on Aaron's existing Claude Code plan and is capped by a token budget.
