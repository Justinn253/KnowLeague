drop index if exists public.category_clash_submissions_player_turn_idx;

create unique index if not exists category_clash_submissions_player_round_turn_idx
  on public.category_clash_submissions(lobby_id, player_id, round_number, turn_sequence)
  where player_id is not null;
