alter table public.carving_revelation_lobbies
  add column if not exists starting_line_length_percent integer not null default 8,
  add column if not exists line_length_increment_percent integer not null default 2;

alter table public.carving_revelation_lobbies
  drop constraint if exists carving_revelation_lobbies_starting_line_length_percent_check,
  drop constraint if exists carving_revelation_lobbies_line_length_increment_percent_check;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_starting_line_length_percent_check
  check (starting_line_length_percent in (5, 8, 10, 15, 20)),
  add constraint carving_revelation_lobbies_line_length_increment_percent_check
  check (line_length_increment_percent in (1, 2, 3, 4, 5));
