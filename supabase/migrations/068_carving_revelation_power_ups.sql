alter table public.carving_revelation_lobbies
  add column if not exists power_ups_enabled boolean not null default true,
  add column if not exists power_up_count integer not null default 3,
  add column if not exists power_ups jsonb not null default '[]'::jsonb;

alter table public.carving_revelation_lobbies
  drop constraint if exists carving_revelation_lobbies_power_up_count_check;

alter table public.carving_revelation_lobbies
  add constraint carving_revelation_lobbies_power_up_count_check
  check (power_up_count between 1 and 10);
