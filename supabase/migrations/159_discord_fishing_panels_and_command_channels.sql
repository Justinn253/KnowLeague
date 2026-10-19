begin;

-- Persist the interaction-reply message that launched an expedition so its
-- outcome can replace that panel instead of creating an additional message.
alter table public.discord_fishing_expeditions
  add column if not exists notification_message_id text
    check (notification_message_id is null or notification_message_id ~ '^[0-9]{17,20}$');

-- Fishing starts in every channel by default. Administrators can instead
-- restrict the /fish command to a selected set of synced, sendable channels.
create table if not exists public.discord_fishing_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  command_all_channels boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_fishing_command_channels (
  guild_id text not null references public.discord_fishing_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

alter table public.discord_fishing_settings enable row level security;
alter table public.discord_fishing_command_channels enable row level security;
revoke all on table public.discord_fishing_settings from anon, authenticated;
revoke all on table public.discord_fishing_command_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_fishing_settings to service_role;
grant select, insert, update, delete on table public.discord_fishing_command_channels to service_role;

create function public.attach_discord_fishing_expedition_message(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_notification_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1
    or p_notification_message_id !~ '^[0-9]{17,20}$' then
    raise exception 'Fishing expedition message data is invalid.';
  end if;

  update public.discord_fishing_expeditions
  set notification_message_id = p_notification_message_id,
      updated_at = now()
  where id = p_expedition_id
    and guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
    and status = 'active';

  return found;
end;
$$;

create function public.replace_discord_fishing_command_configuration(
  p_guild_id text,
  p_command_all_channels boolean,
  p_command_channel_ids text[],
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_command_all_channels is null then
    raise exception 'Fishing command channel scope must be all channels or selected channels.';
  end if;
  if coalesce(cardinality(p_command_channel_ids), 0) > 100 then
    raise exception 'Provide up to one hundred fishing command channels.';
  end if;
  if cardinality(p_command_channel_ids) <> cardinality(array(select distinct unnest(p_command_channel_ids))) then
    raise exception 'Each fishing command channel can only be selected once.';
  end if;

  foreach v_channel_id in array coalesce(p_command_channel_ids, '{}'::text[])
  loop
    if v_channel_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_text_channels
      where guild_id = p_guild_id and channel_id = v_channel_id and sendable
    ) then
      raise exception 'Every fishing command channel must be a currently sendable Discord text channel.';
    end if;
  end loop;

  if not p_command_all_channels and coalesce(cardinality(p_command_channel_ids), 0) = 0 then
    raise exception 'Choose at least one channel when fishing commands are not enabled in all channels.';
  end if;

  insert into public.discord_fishing_settings as current (
    guild_id, command_all_channels, updated_by, updated_at
  ) values (
    p_guild_id, p_command_all_channels, p_updated_by, now()
  ) on conflict (guild_id) do update
  set command_all_channels = excluded.command_all_channels,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_fishing_command_channels
  where guild_id = p_guild_id;

  insert into public.discord_fishing_command_channels (guild_id, channel_id, updated_at)
  select p_guild_id, channel_id, now()
  from unnest(coalesce(p_command_channel_ids, '{}'::text[])) as channel_id;
end;
$$;

revoke all on function public.attach_discord_fishing_expedition_message(text, text, bigint, text) from public;
revoke all on function public.replace_discord_fishing_command_configuration(text, boolean, text[], uuid) from public;
grant execute on function public.attach_discord_fishing_expedition_message(text, text, bigint, text) to service_role;
grant execute on function public.replace_discord_fishing_command_configuration(text, boolean, text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
