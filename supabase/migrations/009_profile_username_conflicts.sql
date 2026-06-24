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
  explicit_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-zA-Z0-9_]', '', 'g'));
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

  if explicit_username <> '' and exists (select 1 from public.profiles where username = next_username) then
    raise exception 'Username is already taken.';
  end if;

  while explicit_username = '' and exists (select 1 from public.profiles where username = next_username) loop
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
