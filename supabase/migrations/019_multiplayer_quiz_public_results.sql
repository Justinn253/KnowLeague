alter table public.multiplayer_quiz_lobbies
  add column if not exists is_public boolean not null default false;

alter table public.multiplayer_quiz_players
  add column if not exists result text not null default 'active';

alter table public.multiplayer_quiz_players
  drop constraint if exists multiplayer_quiz_players_result_check;

alter table public.multiplayer_quiz_players
  add constraint multiplayer_quiz_players_result_check
  check (result in ('active', 'completed', 'failed'));

create index if not exists multiplayer_quiz_public_lobbies_idx
  on public.multiplayer_quiz_lobbies(game_mode, status, is_public, created_at desc);
