begin;

-- The return-table field expires_at shares a name with the drop table column.
-- Explicit INSERT aliases avoid changing a superuser-only PostgreSQL setting.
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
      insert into public.discord_skin_claim_drops as new_drop (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, p_trigger_type, now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning new_drop.id, new_drop.expires_at into v_drop_id, v_expires_at;
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

create or replace function public.force_reserve_discord_skin_claim_drop(
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
      insert into public.discord_skin_claim_drops as new_drop (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, 'manual', now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning new_drop.id, new_drop.expires_at into v_drop_id, v_expires_at;
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

grant execute on function public.reserve_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
