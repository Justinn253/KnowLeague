create table if not exists public.multiplayer_quiz_lobby_bans (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.multiplayer_quiz_lobbies(id) on delete cascade,
  client_id text not null,
  banned_by_player_id uuid references public.multiplayer_quiz_players(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lobby_id, client_id)
);

create index if not exists multiplayer_quiz_bans_lobby_idx
  on public.multiplayer_quiz_lobby_bans(lobby_id);

alter table public.multiplayer_quiz_lobby_bans enable row level security;
grant select, insert, update, delete on table public.multiplayer_quiz_lobby_bans to service_role;
