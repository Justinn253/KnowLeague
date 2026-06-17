create extension if not exists pgcrypto;

create table if not exists public.skincognito_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'terminated')),
  host_player_id uuid,
  player_one_id uuid,
  player_two_id uuid,
  current_turn_player_id uuid,
  winner_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  terminated_at timestamptz
);

create table if not exists public.skincognito_players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.skincognito_lobbies(id) on delete cascade,
  client_id text not null,
  display_name text not null,
  role text not null default 'spectator' check (role in ('host', 'opponent', 'spectator')),
  selected_skin_id text,
  selected_skin_answer text,
  selected_skin_image_url text,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (lobby_id, client_id)
);

alter table public.skincognito_lobbies
  add constraint skincognito_lobbies_host_fk
  foreign key (host_player_id) references public.skincognito_players(id) on delete set null;

alter table public.skincognito_lobbies
  add constraint skincognito_lobbies_player_one_fk
  foreign key (player_one_id) references public.skincognito_players(id) on delete set null;

alter table public.skincognito_lobbies
  add constraint skincognito_lobbies_player_two_fk
  foreign key (player_two_id) references public.skincognito_players(id) on delete set null;

alter table public.skincognito_lobbies
  add constraint skincognito_lobbies_current_turn_fk
  foreign key (current_turn_player_id) references public.skincognito_players(id) on delete set null;

alter table public.skincognito_lobbies
  add constraint skincognito_lobbies_winner_fk
  foreign key (winner_player_id) references public.skincognito_players(id) on delete set null;

create table if not exists public.skincognito_actions (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.skincognito_lobbies(id) on delete cascade,
  player_id uuid not null references public.skincognito_players(id) on delete cascade,
  action_type text not null check (action_type in ('category_guess', 'skin_guess')),
  category_id text,
  guess_value text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.skincognito_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.skincognito_lobbies(id) on delete cascade,
  player_id uuid references public.skincognito_players(id) on delete set null,
  message text not null,
  message_type text not null default 'player' check (message_type in ('player', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists skincognito_lobbies_code_idx on public.skincognito_lobbies(code);
create index if not exists skincognito_players_lobby_id_idx on public.skincognito_players(lobby_id);
create index if not exists skincognito_players_lobby_client_idx on public.skincognito_players(lobby_id, client_id);
create index if not exists skincognito_actions_lobby_created_idx on public.skincognito_actions(lobby_id, created_at);
create index if not exists skincognito_chat_lobby_created_idx on public.skincognito_chat_messages(lobby_id, created_at);

alter table public.skincognito_lobbies enable row level security;
alter table public.skincognito_players enable row level security;
alter table public.skincognito_actions enable row level security;
alter table public.skincognito_chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'skincognito_lobbies'
  ) then
    alter publication supabase_realtime add table public.skincognito_lobbies;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'skincognito_players'
  ) then
    alter publication supabase_realtime add table public.skincognito_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'skincognito_actions'
  ) then
    alter publication supabase_realtime add table public.skincognito_actions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'skincognito_chat_messages'
  ) then
    alter publication supabase_realtime add table public.skincognito_chat_messages;
  end if;
end $$;
