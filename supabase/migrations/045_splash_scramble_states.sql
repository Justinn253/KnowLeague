create table if not exists public.splash_scramble_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.splash_scramble_states enable row level security;

drop policy if exists "Users can manage their splash scramble state" on public.splash_scramble_states;
create policy "Users can manage their splash scramble state"
on public.splash_scramble_states
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists splash_scramble_states_updated_at_idx
on public.splash_scramble_states (updated_at desc);

grant select, insert, update, delete on public.splash_scramble_states to authenticated;
