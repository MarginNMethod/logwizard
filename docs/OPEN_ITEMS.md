# Open items

Questions the team cannot settle alone. Each has the assumption the team is working under. Aaron answers these; the team keeps going on unblocked work.

| # | Question | Working assumption | Needed by |
|---|---|---|---|
| 1 | What number should `OMC_RUN_BUDGET_TOKENS` be? It depends on what your Claude Code plan covers. | Not set. The team reports usage at each gate. | Before launching the full team run |
| 2 | Final project name. | "LogWizard" | Before the README and the OAuth consent screen |
| 3 | Do the 12 funnel step names chosen by `data-dev` fit? (`supabase/CONTRACT.md`) | Yes. Adding a step later needs a new migration. | Phase 3 |
| 4 | How is the rate-limit key hashed? Input and salt are not defined. | Salted hash of the request IP, salt kept in an environment variable. Not yet implemented. | Phase 3 |
| 5 | Planner input fields `owner`, `follow_ups_used`, `follow_up_answers` (added by `eval-dev`) | Accepted as part of the planner call. | Phase 3 |
| 6 | Where does the privacy page live before Vercel exists? | Host it on the first Vercel preview URL after H1; use a placeholder until then. | H1 |
| 7 | `forty-fields` recording has an `unsupported_requests` note over the 200 character reply cap. Replay clips it. | Fix in planner prompt v2 (state the 200 character cap) and re-record `forty-fields`, `vague-user` and `career-center` together. Add the reply-envelope check to the eval runner so this shows up in results. | Before relying on eval numbers in the case study |
| 8 | Replay matches sample answers exactly; the app sends no owner name or email, so the plan uses `owner@example.com`. | Real owner details come with Google sign-in in Phase 4. | Phase 4 |
| 9 | `rate_limits` uses read-then-upsert, which can race. | Acceptable for a portfolio; an atomic Postgres function would need a new migration. | Optional |
