alter table public.category_clash_lobbies
  add column if not exists max_strikes integer not null default 3 check (max_strikes between 1 and 5);

create table if not exists public.category_clash_next_match_votes (
  lobby_id uuid not null references public.category_clash_lobbies(id) on delete cascade,
  player_id uuid not null references public.category_clash_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);

alter table public.category_clash_next_match_votes enable row level security;

grant select, insert, update, delete on table public.category_clash_next_match_votes to service_role;
