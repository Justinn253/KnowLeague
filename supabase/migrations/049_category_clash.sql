create table if not exists public.category_clash_lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'terminated')),
  host_player_id uuid,
  max_players integer not null default 8 check (max_players between 2 and 8),
  is_public boolean not null default false,
  game_mode text not null default 'simultaneous' check (game_mode in ('simultaneous', 'turns')),
  enabled_category_ids jsonb not null default '[]'::jsonb,
  used_answers jsonb not null default '{}'::jsonb,
  turn_order jsonb not null default '[]'::jsonb,
  current_turn_index integer not null default 0 check (current_turn_index >= 0),
  turn_sequence integer not null default 1 check (turn_sequence >= 1),
  round_number integer not null default 1 check (round_number >= 1),
  phase text not null default 'countdown' check (phase in ('countdown', 'answering', 'review', 'intermission')),
  phase_deadline_at timestamptz,
  current_category_id text,
  winner_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  terminated_at timestamptz
);

create table if not exists public.category_clash_players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  client_id text not null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 16),
  role text not null default 'player' check (role in ('host', 'player')),
  result text not null default 'active' check (result in ('active', 'eliminated', 'won')),
  strikes integer not null default 0 check (strikes between 0 and 3),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  connected boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (lobby_id, client_id)
);

alter table public.category_clash_lobbies
  add constraint category_clash_lobbies_host_fk
  foreign key (host_player_id) references public.category_clash_players(id) on delete set null;

alter table public.category_clash_lobbies
  add constraint category_clash_lobbies_winner_fk
  foreign key (winner_player_id) references public.category_clash_players(id) on delete set null;

create table if not exists public.category_clash_submissions (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  player_id uuid references public.category_clash_players(id) on delete set null,
  round_number integer not null check (round_number >= 1),
  turn_sequence integer not null check (turn_sequence >= 1),
  category_id text not null,
  guess text not null check (char_length(trim(guess)) between 1 and 120),
  answer_id text,
  answer_label text,
  correct boolean,
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists category_clash_submissions_player_turn_idx
  on public.category_clash_submissions(lobby_id, player_id, turn_sequence)
  where player_id is not null;

create table if not exists public.category_clash_chat_messages (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  player_id uuid references public.category_clash_players(id) on delete set null,
  message text not null check (char_length(trim(message)) between 1 and 1000),
  message_type text not null default 'system' check (message_type in ('system', 'result', 'player')),
  tone text not null default 'neutral' check (tone in ('neutral', 'correct', 'incorrect')),
  chat_color text not null default 'amber',
  chat_border text not null default 'black',
  created_at timestamptz not null default now()
);

create table if not exists public.category_clash_lobby_events (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.category_clash_lobby_bans (
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  primary key (lobby_id, client_id)
);

create index if not exists category_clash_lobbies_code_idx
  on public.category_clash_lobbies(code);
create index if not exists category_clash_players_lobby_joined_idx
  on public.category_clash_players(lobby_id, joined_at);
create index if not exists category_clash_players_lobby_connected_idx
  on public.category_clash_players(lobby_id, connected, result);
create index if not exists category_clash_submissions_lobby_round_idx
  on public.category_clash_submissions(lobby_id, round_number, turn_sequence, id);
create index if not exists category_clash_chat_messages_lobby_created_idx
  on public.category_clash_chat_messages(lobby_id, created_at, id);
create index if not exists category_clash_events_lobby_created_idx
  on public.category_clash_lobby_events(lobby_id, created_at);

alter table public.category_clash_lobbies enable row level security;
alter table public.category_clash_players enable row level security;
alter table public.category_clash_submissions enable row level security;
alter table public.category_clash_chat_messages enable row level security;
alter table public.category_clash_lobby_events enable row level security;
alter table public.category_clash_lobby_bans enable row level security;

grant select, insert, update, delete on table public.category_clash_lobbies to service_role;
grant select, insert, update, delete on table public.category_clash_players to service_role;
grant select, insert, update, delete on table public.category_clash_submissions to service_role;
grant select, insert, update, delete on table public.category_clash_chat_messages to service_role;
grant select, insert, update, delete on table public.category_clash_lobby_events to service_role;
grant select, insert, update, delete on table public.category_clash_lobby_bans to service_role;
grant usage, select on sequence public.category_clash_submissions_id_seq to service_role;
grant usage, select on sequence public.category_clash_chat_messages_id_seq to service_role;
grant usage, select on sequence public.category_clash_lobby_events_id_seq to service_role;

grant select on table public.category_clash_lobby_events to anon, authenticated;

drop policy if exists "Category Clash lobby events are readable" on public.category_clash_lobby_events;
create policy "Category Clash lobby events are readable"
  on public.category_clash_lobby_events
  for select
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'category_clash_lobby_events'
  ) then
    alter publication supabase_realtime add table public.category_clash_lobby_events;
  end if;
end $$;
