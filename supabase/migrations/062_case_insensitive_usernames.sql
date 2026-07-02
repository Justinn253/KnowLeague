do $$
begin
  if exists (
    select 1
    from public.profiles
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Cannot add case-insensitive username uniqueness while duplicate username variants exist.';
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create or replace function public.find_profile_by_username_ci(search_username text)
returns table(id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  select profiles.id, profiles.username
  from public.profiles
  where lower(profiles.username) = lower(trim(search_username))
  limit 1;
$$;

grant execute on function public.find_profile_by_username_ci(text) to anon, authenticated, service_role;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  explicit_username text;
  requested_username text;
  base_username text;
  next_username text;
  suffix integer := 0;
begin
  explicit_username := regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g');
  requested_username := explicit_username;

  if requested_username = '' then
    requested_username := lower(split_part(new.email, '@', 1));
    requested_username := regexp_replace(requested_username, '[^a-zA-Z0-9_]', '', 'g');
  end if;

  if requested_username = '' then
    requested_username := 'player';
  end if;

  base_username := left(requested_username, 20);
  next_username := base_username;

  if explicit_username <> '' and exists (select 1 from public.profiles where lower(username) = lower(next_username)) then
    raise exception 'Username is already taken.';
  end if;

  while explicit_username = '' and exists (select 1 from public.profiles where lower(username) = lower(next_username)) loop
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
