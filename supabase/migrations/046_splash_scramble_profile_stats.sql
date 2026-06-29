alter table public.splash_scramble_states
alter column state drop not null;

alter table public.splash_scramble_states
add column if not exists stats jsonb not null default '{}'::jsonb;
