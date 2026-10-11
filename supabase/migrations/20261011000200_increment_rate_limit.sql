-- Atomic rate-limit counter. One statement inserts the row or adds one to it and returns the new
-- count, so concurrent requests cannot lose updates. Review before applying; never apply to the
-- existing 'Development' project. Only the service role may call it.
create or replace function public.increment_rate_limit(p_key_hash text, p_window_start timestamptz)
returns integer
language sql
security invoker
set search_path = public
as $$
  insert into public.rate_limits as r (key_hash, window_start, request_count)
  values (p_key_hash, p_window_start, 1)
  on conflict (key_hash, window_start)
  do update set request_count = r.request_count + 1
  returning r.request_count;
$$;

-- Only the server (service role) may call it. The tables already deny anon and authenticated.
revoke all on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;
