-- motif_errors — every error a Motif listener (or a Motif API route) hit, kept
-- 90 days so there is history to look back on. See api/motif-alert.js and the
-- spec at docs/specs/2026-10-03-motif-error-alerts.md.
--
-- Project: nilesheron (gdellbtfpcmdsfogxqwf) — where Motif media and
-- motif_positions live. Reached with MOTIF_SUPABASE_URL /
-- MOTIF_SUPABASE_SERVICE_KEY, never the shared SUPABASE_* vars.
-- Applied 2026-10-04.
--
-- NEVER stored here: Apple or Spotify user ids, tokens, email addresses, IP
-- addresses. Allowed: user agent and its parsed browser/OS/device, the
-- player's step trace (which can include song titles), slug, position, and
-- the pulse listen id (one page load; cannot link two listens).
--
-- RLS on with no policies: only the service key (the API route) can touch it.

create table if not exists public.motif_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null,          -- 'client' | 'server'
  slug        text,
  code        text not null,
  severity    text not null,
  detail      text,
  service     text,
  track_index int,
  side        text,
  elapsed_s   int,
  attempt     int,
  listen_id   text,
  browser     text,
  os          text,
  device      text,
  user_agent  text,
  trace       jsonb,
  alerted_at  timestamptz,
  suppressed  int not null default 0  -- repeats folded into this row's alert
);
create index if not exists motif_errors_recent on public.motif_errors (code, slug, created_at desc);
-- The abuse cap, the hourly email cap and retention all range over created_at.
create index if not exists motif_errors_created on public.motif_errors (created_at desc);
alter table public.motif_errors enable row level security;

-- Retention: 90 days, enforced by pg_cron hourly.
create extension if not exists pg_cron;
select cron.schedule(
  'motif-errors-retention',
  '17 * * * *',
  $$delete from public.motif_errors where created_at < now() - interval '90 days'$$
);
