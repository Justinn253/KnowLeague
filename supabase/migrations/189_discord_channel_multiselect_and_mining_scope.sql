begin;

-- Output destinations are deliberately separate from command scopes: an
-- administrator can publish website results to several channels without
-- opening commands in every one of those channels.
create table public.discord_skindle_share_channels (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (guild_id, channel_id)
);

create table public.discord_mining_website_panel_channels (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (guild_id, channel_id)
);

-- Preserve any existing single-channel configuration while moving to the
-- channel-set tables. The old tables remain read-compatible for the already
-- deployed migration, but new application code reads only these sets.
insert into public.discord_skindle_share_channels (guild_id, channel_id, updated_at, updated_by)
select guild_id, channel_id, updated_at, updated_by
from public.discord_skindle_share_settings
on conflict (guild_id, channel_id) do update
set updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

insert into public.discord_mining_website_panel_channels (guild_id, channel_id, updated_at, updated_by)
select guild_id, channel_id, updated_at, updated_by
from public.discord_mining_website_panel_settings
on conflict (guild_id, channel_id) do update
set updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

alter table public.discord_skindle_share_channels enable row level security;
alter table public.discord_mining_website_panel_channels enable row level security;
revoke all on table public.discord_skindle_share_channels from anon, authenticated;
revoke all on table public.discord_mining_website_panel_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_skindle_share_channels to service_role;
grant select, insert, update, delete on table public.discord_mining_website_panel_channels to service_role;

-- One Skindle completion and one Mining state transition now fan out to every
-- selected destination. Existing rows stay intact during the key transition.
alter table public.discord_skindle_share_outbox
  drop constraint if exists discord_skindle_share_outbox_guild_id_user_id_date_key_key;
alter table public.discord_skindle_share_outbox
  add constraint discord_skindle_share_outbox_guild_user_date_channel_key
  unique (guild_id, user_id, date_key, channel_id);

alter table public.discord_mining_website_panel_events
  drop constraint if exists discord_mining_website_panel_events_expedition_id_event_kind_key;
alter table public.discord_mining_website_panel_events
  add constraint discord_mining_website_panel_events_expedition_event_channel_key
  unique (expedition_id, event_kind, channel_id);

-- Replace the pre-multiselect enqueue function in place while preserving its
-- security and transaction behavior for the website-only RPC wrappers.
create or replace function public.enqueue_discord_mining_website_panel(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_event_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_expected_status text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or p_event_kind not in ('started', 'returning') then
    raise exception 'Mining website panel data is invalid.';
  end if;

  v_expected_status := case when p_event_kind = 'started' then 'descending' else 'returning' end;
  if not exists (
    select 1
    from public.discord_mining_expeditions as expeditions
    where expeditions.id = p_expedition_id
      and expeditions.guild_id = p_guild_id
      and expeditions.discord_user_id = p_discord_user_id
      and expeditions.status = v_expected_status
  ) then
    raise exception 'Mining expedition panel state is unavailable.';
  end if;

  insert into public.discord_mining_website_panel_events (
    guild_id, discord_user_id, expedition_id, channel_id, event_kind
  )
  select p_guild_id, p_discord_user_id, p_expedition_id, channels.channel_id, p_event_kind
  from public.discord_mining_website_panel_channels as channels
  where channels.guild_id = p_guild_id
  on conflict (expedition_id, event_kind, channel_id) do nothing;

  return found;
end;
$$;

-- Mining command scope follows the established Fishing contract: no row (or
-- command_all_channels=true) keeps the feature available everywhere.
create table public.discord_mining_command_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  command_all_channels boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discord_mining_command_channels (
  guild_id text not null references public.discord_mining_command_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

alter table public.discord_mining_command_settings enable row level security;
alter table public.discord_mining_command_channels enable row level security;
revoke all on table public.discord_mining_command_settings from anon, authenticated;
revoke all on table public.discord_mining_command_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_command_settings to service_role;
grant select, insert, update, delete on table public.discord_mining_command_channels to service_role;

create function public.replace_discord_mining_command_configuration(
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
    raise exception 'Mining command channel scope must be all channels or selected channels.';
  end if;
  if coalesce(cardinality(p_command_channel_ids), 0) > 100 then
    raise exception 'Provide up to one hundred Mining command channels.';
  end if;
  if cardinality(p_command_channel_ids) <> cardinality(array(select distinct unnest(p_command_channel_ids))) then
    raise exception 'Each Mining command channel can only be selected once.';
  end if;

  foreach v_channel_id in array coalesce(p_command_channel_ids, '{}'::text[])
  loop
    if v_channel_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_text_channels as channels
      where channels.guild_id = p_guild_id
        and channels.channel_id = v_channel_id
        and channels.sendable
    ) then
      raise exception 'Every Mining command channel must be a currently sendable Discord text channel.';
    end if;
  end loop;

  if not p_command_all_channels and coalesce(cardinality(p_command_channel_ids), 0) = 0 then
    raise exception 'Choose at least one channel when Mining commands are not enabled in all channels.';
  end if;

  insert into public.discord_mining_command_settings as current (
    guild_id, command_all_channels, updated_by, updated_at
  ) values (
    p_guild_id, p_command_all_channels, p_updated_by, now()
  ) on conflict (guild_id) do update
  set command_all_channels = excluded.command_all_channels,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  delete from public.discord_mining_command_channels
  where guild_id = p_guild_id;

  insert into public.discord_mining_command_channels (guild_id, channel_id, updated_at)
  select p_guild_id, channel_id, now()
  from unnest(coalesce(p_command_channel_ids, '{}'::text[])) as channel_id;
end;
$$;

create function public.replace_discord_skindle_share_channels(
  p_guild_id text,
  p_channel_ids text[],
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
  if coalesce(cardinality(p_channel_ids), 0) > 100 then
    raise exception 'Provide up to one hundred Skindle results channels.';
  end if;
  if cardinality(p_channel_ids) <> cardinality(array(select distinct unnest(p_channel_ids))) then
    raise exception 'Each Skindle results channel can only be selected once.';
  end if;
  foreach v_channel_id in array coalesce(p_channel_ids, '{}'::text[])
  loop
    if v_channel_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_text_channels as channels
      where channels.guild_id = p_guild_id
        and channels.channel_id = v_channel_id
        and channels.sendable
    ) then
      raise exception 'Every Skindle results channel must be a currently sendable Discord text channel.';
    end if;
  end loop;

  delete from public.discord_skindle_share_channels
  where guild_id = p_guild_id;

  insert into public.discord_skindle_share_channels (guild_id, channel_id, updated_at, updated_by)
  select p_guild_id, channel_id, now(), p_updated_by
  from unnest(coalesce(p_channel_ids, '{}'::text[])) as channel_id;
end;
$$;

create function public.replace_discord_mining_website_panel_channels(
  p_guild_id text,
  p_channel_ids text[],
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
  if coalesce(cardinality(p_channel_ids), 0) > 100 then
    raise exception 'Provide up to one hundred Mining website panel channels.';
  end if;
  if cardinality(p_channel_ids) <> cardinality(array(select distinct unnest(p_channel_ids))) then
    raise exception 'Each Mining website panel channel can only be selected once.';
  end if;
  foreach v_channel_id in array coalesce(p_channel_ids, '{}'::text[])
  loop
    if v_channel_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_text_channels as channels
      where channels.guild_id = p_guild_id
        and channels.channel_id = v_channel_id
        and channels.sendable
    ) then
      raise exception 'Every Mining website panel channel must be a currently sendable Discord text channel.';
    end if;
  end loop;

  delete from public.discord_mining_website_panel_channels
  where guild_id = p_guild_id;

  insert into public.discord_mining_website_panel_channels (guild_id, channel_id, updated_at, updated_by)
  select p_guild_id, channel_id, now(), p_updated_by
  from unnest(coalesce(p_channel_ids, '{}'::text[])) as channel_id;
end;
$$;

revoke all on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) from public;
revoke all on function public.replace_discord_mining_command_configuration(text, boolean, text[], uuid) from public;
revoke all on function public.replace_discord_skindle_share_channels(text, text[], uuid) from public;
revoke all on function public.replace_discord_mining_website_panel_channels(text, text[], uuid) from public;
grant execute on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) to service_role;
grant execute on function public.replace_discord_mining_command_configuration(text, boolean, text[], uuid) to service_role;
grant execute on function public.replace_discord_skindle_share_channels(text, text[], uuid) to service_role;
grant execute on function public.replace_discord_mining_website_panel_channels(text, text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
