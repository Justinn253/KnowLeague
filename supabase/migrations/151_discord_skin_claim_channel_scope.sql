begin;

-- Channel scope defaults to all current and future sendable guild text channels.
alter table public.discord_skin_claim_settings
  add column if not exists all_channels boolean not null default true;

drop function if exists public.replace_discord_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, text, text[], jsonb, uuid);
drop function if exists public.replace_discord_skin_claim_settings(text, boolean, integer, integer, integer, text, text[], jsonb, uuid);
drop function if exists public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text);
drop function if exists public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text);

alter table public.discord_skin_claim_settings
  drop column if exists automatic_channel_id;

create function public.replace_discord_skin_claim_settings(
  p_guild_id text,
  p_enabled boolean,
  p_minimum_interval_minutes integer,
  p_maximum_interval_minutes integer,
  p_claim_window_minutes integer,
  p_all_channels boolean,
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
  if p_all_channels is null then
    raise exception 'Skin-claim channel scope must be all channels or selected channels.';
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
  if p_enabled and (
    not exists (
      select 1 from public.discord_guild_text_channels
      where guild_id = p_guild_id and sendable
    )
    or (not p_all_channels and coalesce(cardinality(p_eligible_channel_ids), 0) = 0)
  ) then
    raise exception 'Enable skin claims only after Discord has synced a sendable channel or you select at least one eligible channel.';
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
    all_channels, schedule_started_at, last_drop_at, updated_by, updated_at
  ) values (
    p_guild_id, p_enabled, p_minimum_interval_minutes, p_maximum_interval_minutes, p_claim_window_minutes,
    p_all_channels, now(), null, p_updated_by, now()
  ) on conflict (guild_id) do update
  set enabled = excluded.enabled,
      minimum_interval_minutes = excluded.minimum_interval_minutes,
      maximum_interval_minutes = excluded.maximum_interval_minutes,
      claim_window_minutes = excluded.claim_window_minutes,
      all_channels = excluded.all_channels,
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

create function public.reserve_discord_skin_claim_drop(
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

  if v_settings.all_channels then
    if not exists (
      select 1 from public.discord_guild_text_channels
      where guild_id = p_guild_id and channel_id = p_channel_id and sendable
    ) then
      return;
    end if;
  else
    select coalesce(array_agg(channel_id), '{}'::text[]) into v_eligible_channel_ids
    from public.discord_skin_claim_channels
    where guild_id = p_guild_id;
    if not (p_channel_id = any(v_eligible_channel_ids)) then
      return;
    end if;
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

create function public.force_reserve_discord_skin_claim_drop(
  p_guild_id text,
  p_channel_id text,
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
  v_skin_code integer;
  v_drop_id bigint;
  v_expires_at timestamptz;
  v_attempt integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and channel identifiers must be valid snowflakes.';
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

  -- This lock serializes manual requests with normal timed and message drops.
  select * into v_settings
  from public.discord_skin_claim_settings
  where guild_id = p_guild_id
  for update;
  if not found or not v_settings.enabled then
    return;
  end if;

  if v_settings.all_channels then
    if not exists (
      select 1 from public.discord_guild_text_channels
      where guild_id = p_guild_id and channel_id = p_channel_id and sendable
    ) then
      return;
    end if;
  else
    select coalesce(array_agg(channel_id), '{}'::text[]) into v_eligible_channel_ids
    from public.discord_skin_claim_channels
    where guild_id = p_guild_id;
    if not (p_channel_id = any(v_eligible_channel_ids)) then
      return;
    end if;
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

  for v_attempt in 1..100
  loop
    v_skin_code := floor(random() * 9000 + 1000)::integer;
    begin
      insert into public.discord_skin_claim_drops (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, 'manual', now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning id, expires_at into v_drop_id, v_expires_at;
      update public.discord_skin_claim_settings
      set last_drop_at = now(), updated_at = now()
      where guild_id = p_guild_id;
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A live or collected item already owns this four-digit code. Try another.
    end;
  end loop;

  raise exception 'No four-digit skin-claim IDs are currently available.';
end;
$$;

create function public.replace_discord_configuration(
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
  p_skin_claim_all_channels boolean,
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
    p_skin_claim_all_channels,
    p_skin_claim_eligible_channel_ids,
    p_skin_claim_rarity_weights,
    p_updated_by
  );
end;
$$;

revoke all on function public.replace_discord_skin_claim_settings(text, boolean, integer, integer, integer, boolean, text[], jsonb, uuid) from public;
revoke all on function public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) from public;
revoke all on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) from public;
revoke all on function public.replace_discord_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, uuid) from public;
grant execute on function public.replace_discord_skin_claim_settings(text, boolean, integer, integer, integer, boolean, text[], jsonb, uuid) to service_role;
grant execute on function public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.replace_discord_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
