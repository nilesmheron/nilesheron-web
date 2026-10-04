-- motif_positions — where a listener was in a tape, held 48h so a page that
-- iOS discarded and reloaded can offer to resume. See api/motif-position.js.
-- Applied to project gdellbtfpcmdsfogxqwf on 2026-10-03.
--
-- `session` is sha256(Music User Token | slug), computed in the browser: no
-- token, account, or title is ever stored. RLS on with no policies, so only
-- the service key (the API route) can read or write.

create table if not exists public.motif_positions (
  session       text        not null check (session ~ '^[0-9a-f]{64}$'),
  slug          text        not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  idx           integer     not null check (idx between 0 and 999),
  awaiting_flip boolean     not null default false,
  fp            text        not null check (fp ~ '^[0-9a-f]{8,32}$'),
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (session, slug)
);

-- The 48h sweep and the GET filter both range over updated_at.
create index if not exists motif_positions_updated_at on public.motif_positions (updated_at);

alter table public.motif_positions enable row level security;
