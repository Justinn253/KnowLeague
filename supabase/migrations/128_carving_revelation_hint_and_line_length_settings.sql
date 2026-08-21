alter table public.carving_revelation_lobbies
  add column if not exists hint_frequency integer not null default 0;

alter table public.carving_revelation_lobbies
  drop constraint if exists carving_revelation_lobbies_starting_line_length_percent_check,
  drop constraint if exists carving_revelation_lobbies_line_length_increment_percent_check,
  drop constraint if exists carving_revelation_lobbies_hint_frequency_check;

update public.carving_revelation_lobbies
set
  starting_line_length_percent = case
    when starting_line_length_percent in (8, 12, 15, 20) then starting_line_length_percent
    else 12
  end,
  line_length_increment_percent = case
    when line_length_increment_percent in (2, 3, 4, 5, 6) then line_length_increment_percent
    else 4
  end;

alter table public.carving_revelation_lobbies
  alter column starting_line_length_percent set default 12,
  alter column line_length_increment_percent set default 4;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_starting_line_length_percent_check
  check (starting_line_length_percent in (8, 12, 15, 20)),
  add constraint carving_revelation_lobbies_line_length_increment_percent_check
  check (line_length_increment_percent in (2, 3, 4, 5, 6)),
  add constraint carving_revelation_lobbies_hint_frequency_check
  check (hint_frequency in (0, 1, 2, 3, 4));
