create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select on table public.profiles to anon, authenticated;
grant update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  base_username text;
  next_username text;
  suffix integer := 0;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g'));

  if requested_username = '' then
    requested_username := lower(split_part(new.email, '@', 1));
    requested_username := regexp_replace(requested_username, '[^a-zA-Z0-9_]', '', 'g');
  end if;

  if requested_username = '' then
    requested_username := 'player';
  end if;

  base_username := left(requested_username, 20);
  next_username := base_username;

  while exists (select 1 from public.profiles where username = next_username) loop
    suffix := suffix + 1;
    next_username := left(base_username, greatest(1, 20 - length(suffix::text) - 1)) || '_' || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    next_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), next_username),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
