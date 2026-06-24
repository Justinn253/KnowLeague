create table if not exists public.skincognito_bans (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.skincognito_lobbies(id) on delete cascade,
  client_id text not null,
  banned_by_player_id uuid references public.skincognito_players(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lobby_id, client_id)
);

create index if not exists skincognito_bans_lobby_client_idx on public.skincognito_bans(lobby_id, client_id);

alter table public.skincognito_bans enable row level security;

grant select, insert, update, delete on table public.skincognito_bans to service_role;
grant select on table public.skincognito_bans to anon, authenticated;
