create table if not exists public.profile_private_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  discord_username text,
  riot_account_name text,
  updated_at timestamptz not null default now()
);

insert into public.profile_private_details (user_id, discord_username, riot_account_name, updated_at)
select id, discord_username, riot_account_name, now()
from public.profiles
where discord_username is not null
  or riot_account_name is not null
on conflict (user_id) do update set
  discord_username = excluded.discord_username,
  riot_account_name = excluded.riot_account_name,
  updated_at = now();

alter table public.profile_private_details enable row level security;

drop policy if exists "Users can read their own private profile details" on public.profile_private_details;
create policy "Users can read their own private profile details"
  on public.profile_private_details for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own private profile details" on public.profile_private_details;
create policy "Users can insert their own private profile details"
  on public.profile_private_details for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own private profile details" on public.profile_private_details;
create policy "Users can update their own private profile details"
  on public.profile_private_details for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.profile_private_details to authenticated;
grant select, insert, update, delete on table public.profile_private_details to service_role;

revoke select (discord_username, riot_account_name) on table public.profiles from anon, authenticated;
