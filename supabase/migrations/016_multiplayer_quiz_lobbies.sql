create table if not exists public.multiplayer_quiz_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_mode text not null check (game_mode in ('ability_blitz', 'skin_champion')),
  status text not null default 'waiting' check (status in ('waiting', 'terminated')),
  host_player_id uuid,
  difficulty text not null default 'gold' check (difficulty in ('iron', 'gold', 'diamond', 'challenger')),
  modifiers jsonb not null default '[]'::jsonb,
  max_players integer not null default 10 check (max_players between 2 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminated_at timestamptz
);

create table if not exists public.multiplayer_quiz_players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.multiplayer_quiz_lobbies(id) on delete cascade,
  client_id text not null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 16),
  role text not null default 'player' check (role in ('host', 'player')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lobby_id, client_id)
);

alter table public.multiplayer_quiz_lobbies
  add constraint multiplayer_quiz_lobbies_host_fk
  foreign key (host_player_id) references public.multiplayer_quiz_players(id) on delete set null;

create table if not exists public.multiplayer_quiz_lobby_events (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.multiplayer_quiz_lobbies(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists multiplayer_quiz_lobbies_code_idx
  on public.multiplayer_quiz_lobbies(code);
create index if not exists multiplayer_quiz_players_lobby_joined_idx
  on public.multiplayer_quiz_players(lobby_id, joined_at);
create index if not exists multiplayer_quiz_events_lobby_created_idx
  on public.multiplayer_quiz_lobby_events(lobby_id, created_at);

alter table public.multiplayer_quiz_lobbies enable row level security;
alter table public.multiplayer_quiz_players enable row level security;
alter table public.multiplayer_quiz_lobby_events enable row level security;

grant select, insert, update, delete on table public.multiplayer_quiz_lobbies to service_role;
grant select, insert, update, delete on table public.multiplayer_quiz_players to service_role;
grant select, insert, update, delete on table public.multiplayer_quiz_lobby_events to service_role;
grant usage, select on sequence public.multiplayer_quiz_lobby_events_id_seq to service_role;

grant select on table public.multiplayer_quiz_lobby_events to anon, authenticated;

drop policy if exists "Multiplayer quiz lobby events are readable" on public.multiplayer_quiz_lobby_events;
create policy "Multiplayer quiz lobby events are readable"
  on public.multiplayer_quiz_lobby_events
  for select
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_quiz_lobby_events'
  ) then
    alter publication supabase_realtime add table public.multiplayer_quiz_lobby_events;
  end if;
end $$;
