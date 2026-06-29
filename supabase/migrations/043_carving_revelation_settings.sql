alter table public.carving_revelation_lobbies
  add column if not exists phase_duration_seconds integer default 30,
  add column if not exists win_condition text not null default 'everyone_correct',
  add column if not exists modifiers jsonb not null default '[]'::jsonb;

alter table public.carving_revelation_lobbies
  drop constraint if exists carving_revelation_lobbies_phase_duration_seconds_check,
  drop constraint if exists carving_revelation_lobbies_win_condition_check;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_phase_duration_seconds_check
  check (phase_duration_seconds in (10, 20, 30, 45, 60) or phase_duration_seconds is null),
  add constraint carving_revelation_lobbies_win_condition_check
  check (win_condition in ('everyone_correct', 'first_correct'));
