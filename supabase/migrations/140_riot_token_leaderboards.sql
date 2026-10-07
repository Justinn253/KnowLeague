create table if not exists public.riot_token_leaderboard_refreshes (
  refresh_key text not null,
  token_id bigint not null,
  platform text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  primary key (refresh_key, token_id, platform),
  constraint riot_token_leaderboard_refreshes_platform_check check (platform = upper(platform)),
  constraint riot_token_leaderboard_refreshes_status_check check (status in ('running', 'complete', 'error'))
);

create table if not exists public.riot_token_leaderboard_entries (
  refresh_key text not null,
  token_id bigint not null,
  platform text not null,
  rank integer not null check (rank >= 1 and rank <= 250),
  puuid text not null,
  riot_id text,
  points numeric not null,
  captured_at timestamptz not null default now(),
  primary key (refresh_key, token_id, platform, rank),
  constraint riot_token_leaderboard_entries_platform_check check (platform = upper(platform))
);

create unique index if not exists riot_token_leaderboard_entries_player_idx
  on public.riot_token_leaderboard_entries (refresh_key, token_id, platform, puuid);

create index if not exists riot_token_leaderboard_entries_lookup_idx
  on public.riot_token_leaderboard_entries (token_id, platform, refresh_key, rank);

create table if not exists public.riot_token_player_names (
  puuid text not null,
  platform text not null,
  riot_id text not null,
  game_name text not null,
  tag_line text not null,
  last_seen_at timestamptz not null default now(),
  primary key (puuid, platform),
  constraint riot_token_player_names_platform_check check (platform = upper(platform))
);

alter table public.riot_token_leaderboard_refreshes enable row level security;
alter table public.riot_token_leaderboard_entries enable row level security;
alter table public.riot_token_player_names enable row level security;

revoke all on table public.riot_token_leaderboard_refreshes from anon, authenticated;
revoke all on table public.riot_token_leaderboard_entries from anon, authenticated;
revoke all on table public.riot_token_player_names from anon, authenticated;
grant select, insert, update, delete on table public.riot_token_leaderboard_refreshes to service_role;
grant select, insert, update, delete on table public.riot_token_leaderboard_entries to service_role;
grant select, insert, update, delete on table public.riot_token_player_names to service_role;

create or replace function public.claim_riot_token_leaderboard_refresh(
  p_refresh_key text,
  p_token_id bigint,
  p_platform text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_rows integer;
  claimed_rows integer;
begin
  insert into public.riot_token_leaderboard_refreshes (
    refresh_key, token_id, platform, status, started_at, completed_at, error_message
  )
  values (p_refresh_key, p_token_id, upper(p_platform), 'running', now(), null, null)
  on conflict (refresh_key, token_id, platform) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 1 then
    return true;
  end if;

  update public.riot_token_leaderboard_refreshes
  set status = 'running', started_at = now(), completed_at = null, error_message = null
  where refresh_key = p_refresh_key
    and token_id = p_token_id
    and platform = upper(p_platform)
    and status <> 'complete'
    and started_at < now() - interval '10 minutes';

  get diagnostics claimed_rows = row_count;
  return claimed_rows = 1;
end;
$$;

revoke all on function public.claim_riot_token_leaderboard_refresh(text, bigint, text) from public;
grant execute on function public.claim_riot_token_leaderboard_refresh(text, bigint, text) to service_role;

notify pgrst, 'reload schema';
