-- Retention: delete metrics rows older than 90 days, daily at 03:17 UTC.
--
-- APPLY ONLY IF pg_cron IS ENABLED ON THE FREE PLAN for this project
-- (Dashboard > Database > Extensions). If it is not available, skip this file
-- and delete old rows manually (see supabase/README.md). This file does nothing
-- harmful if pg_cron is unavailable: it exits with a notice.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available on this project; retention job NOT scheduled.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Idempotent: drop an earlier schedule with the same name, then recreate.
  if exists (select 1 from cron.job where jobname = 'metrics_retention_90d') then
    perform cron.unschedule('metrics_retention_90d');
  end if;

  perform cron.schedule(
    'metrics_retention_90d',
    '17 3 * * *',
    $job$
      delete from public.funnel_events where created_at   < now() - interval '90 days';
      delete from public.rate_limits   where window_start < now() - interval '90 days';
    $job$
  );
end
$$;
