alter table public.carving_revelation_lobbies
  add column if not exists phase text not null default 'carve',
  add column if not exists phase_deadline_at timestamptz;

alter table public.carving_revelation_lobbies
  drop constraint if exists carving_revelation_lobbies_phase_check;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_phase_check
  check (phase in ('carve', 'guess'));
