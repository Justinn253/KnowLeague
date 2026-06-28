create table if not exists public.carving_revelation_lobby_bans (
  lobby_id uuid not null references public.carving_revelation_lobbies(id) on delete cascade,
  client_id text not null,
  banned_by_player_id uuid references public.carving_revelation_players(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (lobby_id, client_id)
);

create index if not exists carving_revelation_lobby_bans_client_idx
  on public.carving_revelation_lobby_bans(client_id);

alter table public.carving_revelation_lobby_bans enable row level security;

grant select, insert, update, delete on table public.carving_revelation_lobby_bans to service_role;
