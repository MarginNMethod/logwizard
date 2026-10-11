# LogWizard

**Working name.** The final name is not decided (`docs/OPEN_ITEMS.md`, item 2).

LogWizard is a web app that sets up an interaction-logging system in a person's own Google account. An interaction log is a spreadsheet where each row records one contact, such as an email with an employer. The system adds an entry form, copies entries between related logs, sends follow-up reminders, and alerts the owner when someone else adds an entry.

The app is modeled on a system built by hand five times for a university career center. It is a portfolio project. It costs nothing to build or run (`docs/decisions/0005-zero-cost.md`).

---

## The idea: the AI writes a plan, not code

The app interviews the user in plain language. An AI step turns the answers into a JSON plan. A fixed schema and validator check the plan against strict limits, and the user reviews a plain-English preview and can edit it. Only then does a tested engine build the system.

The AI never writes code that runs in a user's account. A bad plan can be caught by validation and by the person reading the preview. A bad script would run with the user's own permissions, so the design avoids that case (`docs/decisions/0002-plan-not-code.md`).

---

## Status

Read this as of 2026-10-11.

**Built**

- Plan schema and validator (`packages/plan-schema`).
- Routing, reminder, digest, send-cap, and alert logic as pure functions (`packages/engine-logic`).
- Apps Script engine, bundled into one file (`apps-script`).
- Web app: interview, plan preview with editing, plan download, and Demo mode (`apps/web`).
- Eval set with 12 synthetic personas and recorded plans (`evals`).
- Metrics migrations for Supabase, written (`supabase`). Whether they have been applied to a project is not verified.

**Verified**

- 441 unit tests pass across the five packages with tests (`CI=1 pnpm -r test`, run 2026-10-11).
- The Apps Script bundle builds, with 5 OAuth scopes, and the build check passes.
- The web app runs in demo mode with no environment variables. Its pages return 200 and a sample plan validates on the first try.
- Eval results: 12 of 12 recorded plans valid on the first try, 11 of 12 match the answer key, 10 of 12 are clean on both checks (`evals/results.md`). These are not API measurements.

**Not yet tested**

- Google sign-in, the Drive copy of the template, and the Activate step. Phase 4 is not built.
- The Google behaviours the engine depends on (permission prompt, form submitter identity, email sending). Spikes 1 to 4 are pending (`SPIKES.md`).
- Accessibility (WCAG 2.1 AA) has not been audited.
- The planner has only been run on recorded plans. No live model call has been made.
- Microsoft: design only (`docs/MICROSOFT_ADAPTER.md`). Nothing is built.

See `docs/test-plan.md` for the full picture, and `docs/traceability.md` for requirement-by-requirement status.

---

## Try it

Demo mode needs no Google sign-in and no API key.

```bash
pnpm install
pnpm -r test                          # unit tests, no keys needed
pnpm --filter @logwizard/web dev      # then open http://localhost:3000/start
```

Pick a sample person in **Sample person**, then click **Begin the interview**. The plan comes from recorded plans in `evals/recordings/`.

Other commands:

```bash
pnpm --filter @logwizard/web build        # production build of the web app
pnpm --filter @logwizard/apps-script build # bundles the Apps Script engine (offline)
```

Requirements: Node.js and pnpm (the root `package.json` pins `pnpm@10.0.0`). The eval runner needs Node 22.15 or newer (`evals/README.md`).

Screenshot placeholder: `docs/screenshots/demo-plan-preview.png` (not yet captured).

---

## Repository map

| Path | What it is |
|---|---|
| `apps/web` | Next.js web app: interview, preview, Demo mode, API routes |
| `packages/plan-schema` | Zod schema, limits, validator, plain-English summary, fixtures, tests |
| `packages/engine-logic` | Pure routing, reminder, digest, send-cap, and alert logic, with tests |
| `apps-script` | The Google Apps Script engine (TypeScript source, esbuild bundle, build check) |
| `evals` | Personas, planner prompt, recordings, eval runner, `results.md` |
| `supabase` | Anonymous metrics migrations and the server contract |
| `docs` | Requirements, user stories, data model, test plan, traceability, privacy, setup guide, demo script, case study, Microsoft design |
| `docs/decisions` | Decision records (ADRs) |
| `docs/gates` | Gate reports from the build |
| `PLAN.md` | The build plan |
| `SPIKES.md` | Phase 0 spike results (Google behaviour checks) |
| `AUDIT.md` | Review of the first draft of the plan |

## Documentation

- Problem, users, goals, and requirements: `docs/requirements.md`
- User stories: `docs/user-stories.md`
- Data model (plan schema and sheet structure): `docs/data-model.md`
- Test plan, eval set, and UAT script: `docs/test-plan.md`
- Requirement traceability: `docs/traceability.md`
- Demo walkthrough (3 minutes): `docs/demo-script.md`
- Case study (skeleton, with measurements still to be taken): `docs/case-study.md`
- Microsoft adapter design: `docs/MICROSOFT_ADAPTER.md`
- Privacy: `docs/privacy.md`
- Setup steps only the owner can do: `docs/setup-guide.md`
- Decisions: `docs/decisions/`

## Privacy and zero cost, in short

- No emails, interview answers, plans, or sheet links are stored on the project's server. The only server data is anonymous funnel counts and rate-limit counters (`docs/privacy.md`).
- No paid plan, paid API, purchased domain, or server-side AI key is part of the design (`docs/decisions/0005-zero-cost.md`).
- Sample data uses `example.com` addresses only.
