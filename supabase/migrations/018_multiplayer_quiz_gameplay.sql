alter table public.multiplayer_quiz_lobbies
  drop constraint if exists multiplayer_quiz_lobbies_status_check;

alter table public.multiplayer_quiz_lobbies
  add constraint multiplayer_quiz_lobbies_status_check
  check (status in ('waiting', 'active', 'finished', 'terminated'));

alter table public.multiplayer_quiz_lobbies
  add column if not exists quiz_item_ids jsonb not null default '[]'::jsonb,
  add column if not exists total_items integer not null default 50 check (total_items between 1 and 100),
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz;

alter table public.multiplayer_quiz_players
  add column if not exists progress integer not null default 0 check (progress >= 0),
  add column if not exists elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  add column if not exists finished_at timestamptz,
  add column if not exists connected boolean not null default true,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists disconnected_at timestamptz;

create index if not exists multiplayer_quiz_players_lobby_connected_idx
  on public.multiplayer_quiz_players(lobby_id, connected, finished_at);
