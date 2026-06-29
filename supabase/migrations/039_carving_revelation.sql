create table if not exists public.carving_revelation_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'terminated')),
  host_player_id uuid,
  max_players integer not null default 8 check (max_players between 2 and 10),
  is_public boolean not null default false,
  secret_skin_id text,
  turn_order jsonb not null default '[]'::jsonb,
  current_turn_index integer not null default 0 check (current_turn_index >= 0),
  round_number integer not null default 1 check (round_number >= 1),
  winner_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  terminated_at timestamptz
);

create table if not exists public.carving_revelation_players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.carving_revelation_lobbies(id) on delete cascade,
  client_id text not null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 16),
  role text not null default 'player' check (role in ('host', 'player')),
  result text not null default 'active' check (result in ('active', 'eliminated', 'won')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (lobby_id, client_id)
);

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_host_fk
  foreign key (host_player_id) references public.carving_revelation_players(id) on delete set null;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_winner_fk
  foreign key (winner_player_id) references public.carving_revelation_players(id) on delete set null;

create table if not exists public.carving_revelation_actions (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.carving_revelation_lobbies(id) on delete cascade,
  player_id uuid references public.carving_revelation_players(id) on delete set null,
  action_type text not null check (action_type in ('draw', 'guess')),
  turn_index integer not null check (turn_index >= 0),
  round_number integer not null check (round_number >= 1),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.carving_revelation_lobby_events (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.carving_revelation_lobbies(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists carving_revelation_lobbies_code_idx
  on public.carving_revelation_lobbies(code);
create index if not exists carving_revelation_players_lobby_joined_idx
  on public.carving_revelation_players(lobby_id, joined_at);
create index if not exists carving_revelation_players_lobby_connected_idx
  on public.carving_revelation_players(lobby_id, connected, result);
create index if not exists carving_revelation_actions_lobby_created_idx
  on public.carving_revelation_actions(lobby_id, created_at, id);
create index if not exists carving_revelation_events_lobby_created_idx
  on public.carving_revelation_lobby_events(lobby_id, created_at);

alter table public.carving_revelation_lobbies enable row level security;
alter table public.carving_revelation_players enable row level security;
alter table public.carving_revelation_actions enable row level security;
alter table public.carving_revelation_lobby_events enable row level security;

grant select, insert, update, delete on table public.carving_revelation_lobbies to service_role;
grant select, insert, update, delete on table public.carving_revelation_players to service_role;
grant select, insert, update, delete on table public.carving_revelation_actions to service_role;
grant select, insert, update, delete on table public.carving_revelation_lobby_events to service_role;
grant usage, select on sequence public.carving_revelation_actions_id_seq to service_role;
grant usage, select on sequence public.carving_revelation_lobby_events_id_seq to service_role;

grant select on table public.carving_revelation_lobby_events to anon, authenticated;

drop policy if exists "Carving Revelation lobby events are readable" on public.carving_revelation_lobby_events;
create policy "Carving Revelation lobby events are readable"
  on public.carving_revelation_lobby_events
  for select
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'carving_revelation_lobby_events'
  ) then
    alter publication supabase_realtime add table public.carving_revelation_lobby_events;
  end if;
end $$;
