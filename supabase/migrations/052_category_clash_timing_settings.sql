alter table public.category_clash_lobbies
  add column if not exists round_seconds integer not null default 10 check (round_seconds in (5, 8, 10, 15, 20)),
  add column if not exists intermission_seconds integer not null default 5 check (intermission_seconds in (0, 3, 5, 10)),
  add column if not exists timer_decrement_interval integer not null default 2 check (timer_decrement_interval in (0, 1, 2, 3));
