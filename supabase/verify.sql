-- Read-only verification queries for the metrics tables. Run in the SQL editor
-- of the NEW dedicated project after applying the migrations. Changes nothing.

-- 1. Exact column list: expect only the documented columns, nothing personal.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('funnel_events', 'rate_limits')
order by table_name, ordinal_position;

-- 2. No suspicious column names (expect zero rows).
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and table_name in ('funnel_events', 'rate_limits')
  and column_name ~* '(email|name|phone|answer|plan|sheet|url|link|ip|user|token|key$)';

-- 3. RLS enabled on both (expect rls_enabled = true for both rows).
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('funnel_events', 'rate_limits');

-- 4. No policies exist (expect zero rows).
select schemaname, tablename, policyname, roles
from pg_policies
where schemaname = 'public' and tablename in ('funnel_events', 'rate_limits');

-- 5. anon/authenticated hold no table privileges (expect zero rows).
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('funnel_events', 'rate_limits')
  and grantee in ('anon', 'authenticated', 'PUBLIC');

-- 6. anon cannot select (expect both false).
select has_table_privilege('anon', 'public.funnel_events', 'select') as anon_funnel_select,
       has_table_privilege('anon', 'public.rate_limits',   'select') as anon_rate_select;

-- 7. authenticated cannot select or insert (expect all false).
select has_table_privilege('authenticated', 'public.funnel_events', 'select') as auth_funnel_select,
       has_table_privilege('authenticated', 'public.funnel_events', 'insert') as auth_funnel_insert,
       has_table_privilege('authenticated', 'public.rate_limits',   'select') as auth_rate_select;

-- 8. Retention job scheduled (expect one row if pg_cron was applied; zero if skipped).
select jobname, schedule, active
from cron.job
where jobname = 'metrics_retention_90d';

-- 9. Nothing older than 90 days remains (expect 0 and 0).
select (select count(*) from public.funnel_events where created_at   < now() - interval '90 days') as old_events,
       (select count(*) from public.rate_limits   where window_start < now() - interval '90 days') as old_limits;
