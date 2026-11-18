begin;

create table public.discord_temporary_voice_non_excludable_roles (
  guild_id text not null references public.discord_temporary_voice_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

alter table public.discord_temporary_voice_non_excludable_roles enable row level security;

revoke all on table public.discord_temporary_voice_non_excludable_roles from anon, authenticated;
grant select, insert, update, delete on table public.discord_temporary_voice_non_excludable_roles to service_role;

alter table public.discord_temporary_voice_channels
  drop constraint discord_temporary_voice_channels_excluded_user_ids_check;

alter table public.discord_temporary_voice_channels
  add constraint discord_temporary_voice_channels_excluded_user_ids_check check (
    jsonb_typeof(excluded_user_ids) = 'array'
    and jsonb_array_length(excluded_user_ids) <= 97
  );

drop function public.replace_discord_temporary_voice_configuration(text, text, text[], uuid);

create function public.replace_discord_temporary_voice_configuration(
  p_guild_id text,
  p_join_to_create_channel_id text,
  p_creator_role_ids text[],
  p_non_excludable_role_ids text[],
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_join_to_create_channel_id is not null and (
    p_join_to_create_channel_id !~ '^[0-9]{17,20}$'
    or not exists (
      select 1
      from public.discord_guild_voice_channels
      where guild_id = p_guild_id
        and channel_id = p_join_to_create_channel_id
        and manageable
        and category_id is not null
    )
  ) then
    raise exception 'Join to Create must be a manageable Discord voice channel inside a category.';
  end if;
  if coalesce(cardinality(p_creator_role_ids), 0) > 25
    or cardinality(coalesce(p_creator_role_ids, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(p_creator_role_ids, '{}'::text[])))) then
    raise exception 'Provide up to twenty-five unique temporary voice creator roles.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_creator_role_ids, '{}'::text[])) as selected(role_id)
    where selected.role_id !~ '^[0-9]{17,20}$'
      or not exists (
        select 1
        from public.discord_guild_roles
        where guild_id = p_guild_id and role_id = selected.role_id
      )
  ) then
    raise exception 'Each temporary voice creator role must be currently synced from Discord.';
  end if;
  if coalesce(cardinality(p_non_excludable_role_ids), 0) > 25
    or cardinality(coalesce(p_non_excludable_role_ids, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(p_non_excludable_role_ids, '{}'::text[])))) then
    raise exception 'Provide up to twenty-five unique temporary voice protected roles.';
  end if;
  if p_guild_id = any(coalesce(p_non_excludable_role_ids, '{}'::text[])) then
    raise exception 'The @everyone role cannot be protected from temporary voice exclusions.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_non_excludable_role_ids, '{}'::text[])) as selected(role_id)
    where selected.role_id !~ '^[0-9]{17,20}$'
      or not exists (
        select 1
        from public.discord_guild_roles
        where guild_id = p_guild_id and role_id = selected.role_id
      )
  ) then
    raise exception 'Each temporary voice protected role must be currently synced from Discord.';
  end if;

  insert into public.discord_temporary_voice_settings as settings (
    guild_id, join_to_create_channel_id, updated_by, updated_at
  ) values (
    p_guild_id, p_join_to_create_channel_id, p_updated_by, now()
  ) on conflict (guild_id) do update set
    join_to_create_channel_id = excluded.join_to_create_channel_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  delete from public.discord_temporary_voice_creator_roles where guild_id = p_guild_id;
  insert into public.discord_temporary_voice_creator_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now()
  from unnest(coalesce(p_creator_role_ids, '{}'::text[])) as role_id;

  delete from public.discord_temporary_voice_non_excludable_roles where guild_id = p_guild_id;
  insert into public.discord_temporary_voice_non_excludable_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now()
  from unnest(coalesce(p_non_excludable_role_ids, '{}'::text[])) as role_id;
end;
$$;

revoke all on function public.replace_discord_temporary_voice_configuration(text, text, text[], text[], uuid) from public;
grant execute on function public.replace_discord_temporary_voice_configuration(text, text, text[], text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
