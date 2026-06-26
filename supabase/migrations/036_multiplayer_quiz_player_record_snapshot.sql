alter table public.multiplayer_quiz_players
  add column if not exists record_wins integer not null default 0 check (record_wins >= 0),
  add column if not exists record_losses integer not null default 0 check (record_losses >= 0);
