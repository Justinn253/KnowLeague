alter table public.category_clash_players
  drop constraint if exists category_clash_players_strikes_check;

alter table public.category_clash_players
  add constraint category_clash_players_strikes_check
  check (strikes between 0 and 5);
