begin;

-- Voice-channel metadata is refreshed from Discord by the bot. It lets the
-- website validate the configured Join to Create source without exposing the
-- bot's guild token or Discord API access to the browser.
create table public.discord_guild_voice_channels (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  channel_name text not null check (char_length(channel_name) between 1 and 100),
  category_id text check (category_id is null or category_id ~ '^[0-9]{17,20}$'),
  position integer not null,
  manageable boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create table public.discord_temporary_voice_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  join_to_create_channel_id text check (join_to_create_channel_id is null or join_to_create_channel_id ~ '^[0-9]{17,20}$'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.discord_temporary_voice_creator_roles (
  guild_id text not null references public.discord_temporary_voice_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

-- This mapping is intentionally persisted so empty-channel cleanup, owner-only
-- configuration, exclusions, and the one-minute unjoined expiry survive a bot
-- process restart. It stores Discord identifiers and channel settings only.
create table public.discord_temporary_voice_channels (
  channel_id text primary key check (channel_id ~ '^[0-9]{17,20}$'),
  guild_id text not null references public.discord_temporary_voice_settings(guild_id) on delete cascade,
  category_id text not null check (category_id ~ '^[0-9]{17,20}$'),
  owner_discord_user_id text not null check (owner_discord_user_id ~ '^[0-9]{17,20}$'),
  creation_source text not null check (creation_source in ('command', 'join_to_create')),
  excluded_user_ids jsonb not null default '[]'::jsonb check (
    jsonb_typeof(excluded_user_ids) = 'array'
    and jsonb_array_length(excluded_user_ids) <= 10
  ),
  is_locked boolean not null default false,
  maximum_users smallint not null default 0 check (maximum_users between 0 and 99),
  status text check (status is null or char_length(status) between 1 and 500),
  empty_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discord_temporary_voice_channels_guild_expiry_idx
  on public.discord_temporary_voice_channels (guild_id, empty_expires_at)
  where empty_expires_at is not null;

alter table public.discord_guild_voice_channels enable row level security;
alter table public.discord_temporary_voice_settings enable row level security;
alter table public.discord_temporary_voice_creator_roles enable row level security;
alter table public.discord_temporary_voice_channels enable row level security;

revoke all on table public.discord_guild_voice_channels from anon, authenticated;
revoke all on table public.discord_temporary_voice_settings from anon, authenticated;
revoke all on table public.discord_temporary_voice_creator_roles from anon, authenticated;
revoke all on table public.discord_temporary_voice_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_guild_voice_channels to service_role;
grant select, insert, update, delete on table public.discord_temporary_voice_settings to service_role;
grant select, insert, update, delete on table public.discord_temporary_voice_creator_roles to service_role;
grant select, insert, update, delete on table public.discord_temporary_voice_channels to service_role;

create function public.replace_discord_temporary_voice_configuration(
  p_guild_id text,
  p_join_to_create_channel_id text,
  p_creator_role_ids text[],
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
end;
$$;

revoke all on function public.replace_discord_temporary_voice_configuration(text, text, text[], uuid) from public;
grant execute on function public.replace_discord_temporary_voice_configuration(text, text, text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
