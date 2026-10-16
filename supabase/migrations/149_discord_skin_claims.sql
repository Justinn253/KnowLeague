begin;

create table if not exists public.discord_guild_text_channels (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  channel_name text not null check (char_length(channel_name) between 1 and 100),
  position integer not null,
  sendable boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create index if not exists discord_guild_text_channels_guild_position_idx
  on public.discord_guild_text_channels(guild_id, position asc, channel_name asc);

create table if not exists public.discord_skin_claim_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  enabled boolean not null default false,
  minimum_interval_minutes integer not null default 30 check (minimum_interval_minutes between 1 and 10080),
  maximum_interval_minutes integer not null default 120 check (maximum_interval_minutes between 1 and 10080),
  claim_window_minutes integer not null default 30 check (claim_window_minutes between 1 and 1440),
  automatic_channel_id text check (automatic_channel_id is null or automatic_channel_id ~ '^[0-9]{17,20}$'),
  schedule_started_at timestamptz not null default now(),
  last_drop_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maximum_interval_minutes >= minimum_interval_minutes)
);

create table if not exists public.discord_skin_claim_channels (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create table if not exists public.discord_skin_claim_rarity_weights (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  rarity text not null check (rarity in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')),
  weight integer not null check (weight between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, rarity)
);

create table if not exists public.discord_skin_claim_drops (
  id bigint generated always as identity primary key,
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  message_id text unique check (message_id is null or message_id ~ '^[0-9]{17,20}$'),
  skin_code integer not null check (skin_code between 1000 and 9999),
  skin_catalog_id text not null check (skin_catalog_id ~ '^[0-9]{1,20}$'),
  skin_name text not null check (char_length(skin_name) between 1 and 150),
  champion_name text not null check (char_length(champion_name) between 1 and 100),
  rarity text not null check (rarity in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')),
  release_date date not null,
  skin_line text not null check (char_length(skin_line) between 1 and 150),
  image_url text not null check (char_length(image_url) between 8 and 1000 and image_url ~ '^https://'),
  trigger_type text not null check (trigger_type in ('message', 'timer')),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'expired', 'send_failed')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by_discord_user_id text check (claimed_by_discord_user_id is null or claimed_by_discord_user_id ~ '^[0-9]{17,20}$'),
  owner_discord_user_id text check (owner_discord_user_id is null or owner_discord_user_id ~ '^[0-9]{17,20}$'),
  claimed_at timestamptz,
  transferred_at timestamptz,
  check ((status = 'claimed') = (claimed_by_discord_user_id is not null and owner_discord_user_id is not null and claimed_at is not null))
);

create unique index if not exists discord_skin_claim_one_pending_drop_idx
  on public.discord_skin_claim_drops(guild_id)
  where status = 'pending';

create unique index if not exists discord_skin_claim_active_skin_code_idx
  on public.discord_skin_claim_drops(guild_id, skin_code)
  where status in ('pending', 'claimed');

create index if not exists discord_skin_claim_drops_active_idx
  on public.discord_skin_claim_drops(guild_id, status, expires_at asc);

create index if not exists discord_skin_claim_drops_owner_idx
  on public.discord_skin_claim_drops(guild_id, owner_discord_user_id, claimed_at asc, id asc)
  where status = 'claimed';

alter table public.discord_guild_text_channels enable row level security;
alter table public.discord_skin_claim_settings enable row level security;
alter table public.discord_skin_claim_channels enable row level security;
alter table public.discord_skin_claim_rarity_weights enable row level security;
alter table public.discord_skin_claim_drops enable row level security;

revoke all on table public.discord_guild_text_channels from anon, authenticated;
revoke all on table public.discord_skin_claim_settings from anon, authenticated;
revoke all on table public.discord_skin_claim_channels from anon, authenticated;
revoke all on table public.discord_skin_claim_rarity_weights from anon, authenticated;
revoke all on table public.discord_skin_claim_drops from anon, authenticated;

grant select, insert, update, delete on table public.discord_guild_text_channels to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_settings to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_channels to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_rarity_weights to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_drops to service_role;

create or replace function public.replace_discord_skin_claim_settings(
  p_guild_id text,
  p_enabled boolean,
  p_minimum_interval_minutes integer,
  p_maximum_interval_minutes integer,
  p_claim_window_minutes integer,
  p_automatic_channel_id text,
  p_eligible_channel_ids text[],
  p_rarity_weights jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id text;
  v_rarity text;
  v_weight integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_minimum_interval_minutes not between 1 and 10080
    or p_maximum_interval_minutes not between p_minimum_interval_minutes and 10080 then
    raise exception 'Skin-claim intervals must be whole minutes with the maximum at or above the minimum.';
  end if;
  if p_claim_window_minutes not between 1 and 1440 then
    raise exception 'Skin-claim windows must be between 1 and 1,440 minutes.';
  end if;
  if coalesce(array_length(p_eligible_channel_ids, 1), 0) > 25 then
    raise exception 'Provide up to twenty-five eligible skin-claim channels.';
  end if;
  if cardinality(p_eligible_channel_ids) <> cardinality(array(select distinct unnest(p_eligible_channel_ids))) then
    raise exception 'Each eligible skin-claim channel can only be selected once.';
  end if;
  foreach v_channel_id in array coalesce(p_eligible_channel_ids, '{}'::text[])
  loop
    if v_channel_id !~ '^[0-9]{17,20}$' or not exists (
      select 1 from public.discord_guild_text_channels
      where guild_id = p_guild_id and channel_id = v_channel_id and sendable
    ) then
      raise exception 'Every eligible skin-claim channel must be a currently sendable Discord text channel.';
    end if;
  end loop;
  if p_automatic_channel_id is not null and (
    p_automatic_channel_id !~ '^[0-9]{17,20}$'
    or not (p_automatic_channel_id = any(coalesce(p_eligible_channel_ids, '{}'::text[])))
  ) then
    raise exception 'The automatic skin-claim channel must be one of the eligible channels.';
  end if;
  if p_enabled and (cardinality(p_eligible_channel_ids) = 0 or p_automatic_channel_id is null) then
    raise exception 'Enable skin claims only after selecting eligible channels and an automatic spawn channel.';
  end if;
  if jsonb_typeof(p_rarity_weights) <> 'array' or jsonb_array_length(p_rarity_weights) <> 8 then
    raise exception 'Provide one rarity weight for every supported skin rarity.';
  end if;
  for v_rarity, v_weight in
    select value->>'rarity', (value->>'weight')::integer
    from jsonb_array_elements(p_rarity_weights)
  loop
    if v_rarity not in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')
      or v_weight not between 0 and 1000 then
      raise exception 'Skin rarity weights must use a supported rarity and a value from zero to 1,000.';
    end if;
  end loop;
  if (select count(distinct value->>'rarity') from jsonb_array_elements(p_rarity_weights)) <> 8 then
    raise exception 'Provide each supported skin rarity exactly once.';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_rarity_weights) where (value->>'weight')::integer > 0) then
    raise exception 'At least one skin rarity must have a positive weight.';
  end if;

  insert into public.discord_skin_claim_settings as current (
    guild_id, enabled, minimum_interval_minutes, maximum_interval_minutes, claim_window_minutes,
    automatic_channel_id, schedule_started_at, last_drop_at, updated_by, updated_at
  ) values (
    p_guild_id, p_enabled, p_minimum_interval_minutes, p_maximum_interval_minutes, p_claim_window_minutes,
    p_automatic_channel_id, now(), null, p_updated_by, now()
  ) on conflict (guild_id) do update
  set enabled = excluded.enabled,
      minimum_interval_minutes = excluded.minimum_interval_minutes,
      maximum_interval_minutes = excluded.maximum_interval_minutes,
      claim_window_minutes = excluded.claim_window_minutes,
      automatic_channel_id = excluded.automatic_channel_id,
      schedule_started_at = case
        when not current.enabled and excluded.enabled then now()
        else current.schedule_started_at
      end,
      last_drop_at = case
        when not current.enabled and excluded.enabled then null
        else current.last_drop_at
      end,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_skin_claim_channels where guild_id = p_guild_id;
  insert into public.discord_skin_claim_channels (guild_id, channel_id, updated_at)
  select p_guild_id, channel_id, now()
  from unnest(coalesce(p_eligible_channel_ids, '{}'::text[])) as channel_id;

  delete from public.discord_skin_claim_rarity_weights where guild_id = p_guild_id;
  insert into public.discord_skin_claim_rarity_weights (guild_id, rarity, weight, updated_at)
  select p_guild_id, value->>'rarity', (value->>'weight')::integer, now()
  from jsonb_array_elements(p_rarity_weights);
end;
$$;

create or replace function public.reserve_discord_skin_claim_drop(
  p_guild_id text,
  p_channel_id text,
  p_trigger_type text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text
)
returns table (drop_id bigint, skin_code integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.discord_skin_claim_settings%rowtype;
  v_active_drop public.discord_skin_claim_drops%rowtype;
  v_eligible_channel_ids text[];
  v_base_time timestamptz;
  v_skin_code integer;
  v_drop_id bigint;
  v_expires_at timestamptz;
  v_attempt integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and channel identifiers must be valid snowflakes.';
  end if;
  if p_trigger_type not in ('message', 'timer') then
    raise exception 'Skin-claim trigger type must be message or timer.';
  end if;
  if p_skin_catalog_id !~ '^[0-9]{1,20}$'
    or char_length(p_skin_name) not between 1 and 150
    or char_length(p_champion_name) not between 1 and 100
    or p_rarity not in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')
    or p_release_date is null
    or char_length(p_skin_line) not between 1 and 150
    or char_length(p_image_url) not between 8 and 1000
    or p_image_url !~ '^https://' then
    raise exception 'Skin-claim drop data is invalid.';
  end if;

  select * into v_settings
  from public.discord_skin_claim_settings
  where guild_id = p_guild_id
  for update;
  if not found or not v_settings.enabled then
    return;
  end if;

  select coalesce(array_agg(channel_id), '{}'::text[]) into v_eligible_channel_ids
  from public.discord_skin_claim_channels
  where guild_id = p_guild_id;
  if not (p_channel_id = any(v_eligible_channel_ids))
    or (p_trigger_type = 'timer' and p_channel_id is distinct from v_settings.automatic_channel_id) then
    return;
  end if;

  select * into v_active_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and status = 'pending'
  for update;
  if found then
    if v_active_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_active_drop.id;
    elsif v_active_drop.message_id is null and v_active_drop.reserved_at <= now() - interval '2 minutes' then
      update public.discord_skin_claim_drops set status = 'send_failed' where id = v_active_drop.id;
    else
      return;
    end if;
  end if;

  v_base_time := coalesce(v_settings.last_drop_at, v_settings.schedule_started_at);
  if (p_trigger_type = 'message' and now() < v_base_time + make_interval(mins => v_settings.minimum_interval_minutes))
    or (p_trigger_type = 'timer' and now() < v_base_time + make_interval(mins => v_settings.maximum_interval_minutes)) then
    return;
  end if;

  for v_attempt in 1..100
  loop
    v_skin_code := floor(random() * 9000 + 1000)::integer;
    begin
      insert into public.discord_skin_claim_drops (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, p_trigger_type, now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning id, expires_at into v_drop_id, v_expires_at;
      update public.discord_skin_claim_settings
      set last_drop_at = now(), updated_at = now()
      where guild_id = p_guild_id;
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A live collection item already owns this four-digit code. Try another.
    end;
  end loop;

  raise exception 'No four-digit skin-claim IDs are currently available.';
end;
$$;

create or replace function public.attach_discord_skin_claim_message(
  p_guild_id text,
  p_drop_id bigint,
  p_message_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_message_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and message identifiers must be valid snowflakes.';
  end if;
  update public.discord_skin_claim_drops
  set message_id = p_message_id
  where id = p_drop_id and guild_id = p_guild_id and status = 'pending' and message_id is null;
  if not found then
    raise exception 'The pending skin-claim drop is no longer available.';
  end if;
end;
$$;

create or replace function public.claim_discord_skin_drop(
  p_guild_id text,
  p_message_id text,
  p_discord_user_id text
)
returns table (
  claimed boolean,
  skin_code integer,
  skin_name text,
  champion_name text,
  rarity text,
  release_date date,
  skin_line text,
  image_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_message_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, message, and user identifiers must be valid snowflakes.';
  end if;
  select * into v_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and message_id = p_message_id
  for update;
  if not found then
    return;
  end if;
  if v_drop.status <> 'pending' or v_drop.expires_at <= now() then
    if v_drop.status = 'pending' and v_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_drop.id;
    end if;
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
    return;
  end if;

  update public.discord_skin_claim_drops
  set status = 'claimed',
      claimed_by_discord_user_id = p_discord_user_id,
      owner_discord_user_id = p_discord_user_id,
      claimed_at = now()
  where id = v_drop.id;
  return query select true, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
end;
$$;

create or replace function public.transfer_discord_skin_claim(
  p_guild_id text,
  p_sender_discord_user_id text,
  p_recipient_discord_user_id text,
  p_skin_code integer
)
returns table (skin_name text, skin_code integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_sender_discord_user_id !~ '^[0-9]{17,20}$'
    or p_recipient_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_sender_discord_user_id = p_recipient_discord_user_id then
    raise exception 'A skin cannot be transferred to the same member.';
  end if;
  if p_skin_code not between 1000 and 9999 then
    raise exception 'Skin IDs must be four digits.';
  end if;
  select * into v_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id
    and owner_discord_user_id = p_sender_discord_user_id
    and skin_code = p_skin_code
    and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_recipient_discord_user_id,
      transferred_at = now()
  where id = v_drop.id;
  return query select v_drop.skin_name, v_drop.skin_code;
end;
$$;

create or replace function public.replace_discord_configuration(
  p_guild_id text,
  p_enabled boolean,
  p_xp_per_message integer,
  p_cooldown_seconds integer,
  p_level_up_message_enabled boolean,
  p_level_up_message_template text,
  p_level_up_message_channel_id text,
  p_leaderboard_top_role_id text,
  p_role_rewards jsonb,
  p_manual_xp_role_ids jsonb,
  p_leaderboard_excluded_role_ids jsonb,
  p_skin_claim_enabled boolean,
  p_skin_claim_minimum_interval_minutes integer,
  p_skin_claim_maximum_interval_minutes integer,
  p_skin_claim_window_minutes integer,
  p_skin_claim_automatic_channel_id text,
  p_skin_claim_eligible_channel_ids text[],
  p_skin_claim_rarity_weights jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.replace_discord_leveling_settings(
    p_guild_id,
    p_enabled,
    p_xp_per_message,
    p_cooldown_seconds,
    p_level_up_message_enabled,
    p_level_up_message_template,
    p_level_up_message_channel_id,
    p_leaderboard_top_role_id,
    p_updated_by,
    p_role_rewards,
    p_manual_xp_role_ids,
    p_leaderboard_excluded_role_ids
  );
  perform public.replace_discord_skin_claim_settings(
    p_guild_id,
    p_skin_claim_enabled,
    p_skin_claim_minimum_interval_minutes,
    p_skin_claim_maximum_interval_minutes,
    p_skin_claim_window_minutes,
    p_skin_claim_automatic_channel_id,
    p_skin_claim_eligible_channel_ids,
    p_skin_claim_rarity_weights,
    p_updated_by
  );
end;
$$;

revoke all on function public.replace_discord_skin_claim_settings(text, boolean, integer, integer, integer, text, text[], jsonb, uuid) from public;
revoke all on function public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) from public;
revoke all on function public.attach_discord_skin_claim_message(text, bigint, text) from public;
revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
revoke all on function public.transfer_discord_skin_claim(text, text, text, integer) from public;
revoke all on function public.replace_discord_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, text, text[], jsonb, uuid) from public;
grant execute on function public.replace_discord_skin_claim_settings(text, boolean, integer, integer, integer, text, text[], jsonb, uuid) to service_role;
grant execute on function public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.attach_discord_skin_claim_message(text, bigint, text) to service_role;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;
grant execute on function public.transfer_discord_skin_claim(text, text, text, integer) to service_role;
grant execute on function public.replace_discord_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, text, text[], jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
