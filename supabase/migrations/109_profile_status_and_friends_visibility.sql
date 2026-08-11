-- Profile status is intentionally short so it can be rendered in compact social surfaces.
alter table public.profiles
  add column if not exists profile_status text not null default '',
  add column if not exists friends_list_public boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_profile_status_length_check;

alter table public.profiles
  add constraint profiles_profile_status_length_check
  check (char_length(profile_status) <= 50);

create index if not exists profiles_friends_list_public_idx
  on public.profiles (friends_list_public)
  where friends_list_public = true;

notify pgrst, 'reload schema';
