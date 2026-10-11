-- Anonymous metrics tables for Outreach Logging Wizard (see docs/decisions/0004-minimal-supabase.md).
-- No personal data. Only the server (service role) may read or write.
-- Review before applying. Never apply to the existing 'Development' project.

create table if not exists public.funnel_events (
  id                bigint generated always as identity primary key,
  session_id        uuid not null,            -- random per browser session, no link to any user
  step              text not null,
  duration_ms       integer,
  validation_result text,
  retry_count       integer not null default 0,
  ai_mode           text not null,
  created_at        timestamptz not null default now(),

  constraint funnel_events_step_check check (step in (
    'interview_started',
    'interview_completed',
    'plan_requested',
    'plan_generated',
    'plan_validated',
    'preview_opened',
    'preview_edited',
    'plan_approved',
    'plan_downloaded',
    'build_started',
    'build_succeeded',
    'build_failed'
  )),
  constraint funnel_events_validation_result_check
    check (validation_result is null or validation_result in ('pass', 'fail', 'retry_pass')),
  constraint funnel_events_ai_mode_check check (ai_mode in ('replay', 'byok')),
  constraint funnel_events_duration_ms_check check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 86400000)),
  constraint funnel_events_retry_count_check check (retry_count between 0 and 10)
);

create index if not exists funnel_events_created_at_idx on public.funnel_events (created_at);
create index if not exists funnel_events_step_idx on public.funnel_events (step);

create table if not exists public.rate_limits (
  key_hash      text not null,                -- salted hash of the visitor key, never the raw value
  window_start  timestamptz not null,
  request_count integer not null default 0,

  primary key (key_hash, window_start),
  constraint rate_limits_request_count_check check (request_count >= 0),
  constraint rate_limits_key_hash_check check (char_length(key_hash) between 16 and 128)
);

create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Row Level Security on, with NO policies: anon and authenticated get nothing.
-- The service role bypasses RLS, so only the server route can read or write.
alter table public.funnel_events enable row level security;
alter table public.rate_limits   enable row level security;

revoke all on table public.funnel_events from anon, authenticated;
revoke all on table public.rate_limits   from anon, authenticated;
revoke all on sequence public.funnel_events_id_seq from anon, authenticated;
