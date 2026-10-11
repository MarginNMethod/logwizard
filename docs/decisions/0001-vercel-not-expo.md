# 0001: Host on Vercel, not Expo

Status: accepted. Date: 2026-10-11.

## Context
The plan needs a hosting choice. Expo builds mobile apps. Vercel hosts web apps.

## Decision
Use Next.js on Vercel.

## Why
- Mobile apps are out of scope.
- The interview and preview are a desktop-friendly web flow.
- Vercel gives preview URLs for each pull request, so each gate can be reviewed from a link.
- Vercel Hobby is free and provides environment variable management, which keeps the project within the zero-cost rule (decision 0005).

## Consequences
The app is web only. Revisit if a mobile need appears.
