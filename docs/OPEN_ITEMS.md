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
