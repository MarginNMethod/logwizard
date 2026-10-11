# supabase/

Anonymous metrics for Outreach Logging Wizard. See `docs/decisions/0004-minimal-supabase.md` and PLAN.md section 3.

## Tables

- `funnel_events`: one row per funnel step (interview, plan, preview, build). Holds a random session id, step name, duration in ms, validation result (`pass`, `fail`, `retry_pass`), retry count, AI mode (`replay` or `byok`), and a timestamp. Supplies the measured numbers for the case study.
- `rate_limits`: hashed visitor key, window start, request count. Used for the per-visitor rate limit.

## Never stored

No emails, names, interview answers, plans, sheet links, IP addresses, API keys, or anything that links a session to a person. The session id is a random uuid with no user link. There is no column that could hold such data, and `verify.sql` checks this.

## Access model

Row Level Security is on for both tables with no policies, and all privileges are revoked from `anon` and `authenticated`. Only the service role (used by the Next.js server route, key kept in Vercel env vars) can read or write. Rows older than 90 days are deleted.

## Files

- `migrations/20261011000000_create_metrics_tables.sql`: tables, constraints, RLS, revokes.
- `migrations/20261011000100_metrics_retention_cron.sql`: 90 day retention via pg_cron. Apply only if pg_cron is enabled on the free plan. Otherwise skip it and clear old rows by hand (`delete from public.funnel_events where created_at < now() - interval '90 days';` and the same for `rate_limits` on `window_start`).
- `verify.sql`: read-only checks.
- `CONTRACT.md`: insert payloads and the fail-open rule for the web server.

## How to apply (human-reviewed)

1. Read both migrations.
2. Create a NEW dedicated Supabase project on the Free plan. Do NOT apply to the existing 'Development' project.
3. Confirm no paid add-on is enabled.
4. Run the first migration in the SQL editor (or `supabase db push` against the new project).
5. If pg_cron is available on the free plan, run the second migration.
6. Run `verify.sql` and check every expected result.
7. Put the project URL and service role key in Vercel environment variables only.

## Verification checklist

Run `verify.sql`. Expected:

1. Column list matches the documented columns only.
2. Suspicious-column-name query returns zero rows.
3. `rls_enabled` is true for both tables.
4. No policies exist.
5. `anon`, `authenticated`, and `PUBLIC` have no table grants.
6. `has_table_privilege` is false for anon select and authenticated select/insert.
7. Retention job present (if applied).
8. No rows older than 90 days.

Also confirm manually that a request with the anon key to the REST endpoint for either table returns no rows or a permission error.
