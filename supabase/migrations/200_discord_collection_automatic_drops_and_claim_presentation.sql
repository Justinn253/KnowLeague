begin;

-- Automatic drops use the same channel scope, cadence, one-live-drop lock,
-- four-digit ID, and catalogue-lock constraints as automatic skin drops while
-- allowing the generated item and rune catalogues into the normal rotation.
create function public.reserve_discord_collection_drop(
  p_guild_id text,
  p_channel_id text,
  p_trigger_type text,
  p_collection_type text,
  p_catalog_id text,
  p_name text,
  p_collection_tier smallint,
  p_image_url text,
  p_collection_metadata jsonb default '{}'::jsonb
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
  v_internal_rarity text;
  v_attempt integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and channel identifiers must be valid snowflakes.';
  end if;
  if p_trigger_type not in ('message', 'timer') then
    raise exception 'Collection drop trigger type must be message or timer.';
  end if;
  if p_collection_type not in ('item', 'rune')
    or p_catalog_id !~ '^(item|rune-(keystone|style|sub-rune)):[a-z0-9:_-]{1,190}$'
    or char_length(p_name) not between 1 and 150
    or p_collection_tier not between 1 and 5
    or char_length(p_image_url) not between 8 and 1000
    or p_image_url !~ '^https://'
    or jsonb_typeof(coalesce(p_collection_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Collection drop data is invalid.';
  end if;
  if p_collection_type = 'rune' and p_collection_tier not between 2 and 4 then
    raise exception 'Rune collection tiers must be between 2 and 4.';
  end if;

  v_internal_rarity := case p_collection_tier
    when 1 then 'Common'
    when 2 then 'Rare'
    when 3 then 'Epic'
    when 4 then 'Legendary'
    else 'Mythic'
  end;

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
        release_date, skin_line, image_url, trigger_type, expires_at,
        collection_type, collection_tier, collection_metadata
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_catalog_id, p_name,
        case when p_collection_type = 'item' then 'Item' else 'Rune' end,
        v_internal_rarity, '2009-10-27',
        case when p_collection_type = 'item' then 'League item' else 'League rune' end,
        p_image_url, p_trigger_type, now() + make_interval(mins => v_settings.claim_window_minutes),
        p_collection_type, p_collection_tier, coalesce(p_collection_metadata, '{}'::jsonb)
      ) returning new_drop.id, new_drop.expires_at into v_drop_id, v_expires_at;
      update public.discord_skin_claim_settings
      set last_drop_at = now(), updated_at = now()
      where guild_id = p_guild_id;
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- Try another KnowLeague ID if it or the catalogue entry is already owned.
    end;
  end loop;

  raise exception 'No four-digit collection IDs are currently available.';
end;
$$;

-- The original claim timestamp is returned with the authoritative claimed
-- result so the edited Discord drop can display the exact time that won the
-- reaction race instead of fabricating it in the bot process.
drop function if exists public.claim_discord_skin_drop(text, text, text);

create function public.claim_discord_skin_drop(
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
  image_url text,
  collection_type text,
  collection_tier smallint,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_capacity integer;
  v_owned_count integer;
  v_collection_order bigint;
  v_claimed_at timestamptz;
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
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier, v_drop.claimed_at;
    return;
  end if;
  if v_drop.claim_grace_discord_user_id is not null
    and v_drop.claim_grace_expires_at > now()
    and v_drop.claim_grace_discord_user_id <> p_discord_user_id then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier, v_drop.claimed_at;
    return;
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier, v_drop.claimed_at;
    return;
  end if;
  select coalesce(max(drops.collection_order), 0) + 1 into v_collection_order
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';

  update public.discord_skin_claim_drops
  set status = 'claimed',
      claimed_by_discord_user_id = p_discord_user_id,
      owner_discord_user_id = p_discord_user_id,
      claimed_at = now(),
      owner_acquired_at = now(),
      ownership_method = 'claimed',
      is_favorite = false,
      collection_order = v_collection_order,
      claim_grace_discord_user_id = null,
      claim_grace_expires_at = null
  where id = v_drop.id
  returning claimed_at into v_claimed_at;
  return query select true, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier, v_claimed_at;
end;
$$;

revoke all on function public.reserve_discord_collection_drop(text, text, text, text, text, text, smallint, text, jsonb) from public;
revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
grant execute on function public.reserve_discord_collection_drop(text, text, text, text, text, text, smallint, text, jsonb) to service_role;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
