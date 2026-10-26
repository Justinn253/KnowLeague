begin;

-- The existing collection table keeps its historical skin-oriented column
-- names for compatibility, while these explicit fields identify the broader
-- collection entry model. Existing skins remain type=skin with no tier.
alter table public.discord_skin_claim_drops
  drop constraint if exists discord_skin_claim_drops_skin_catalog_id_check;

alter table public.discord_skin_claim_drops
  add constraint discord_skin_claim_drops_skin_catalog_id_check
  check (skin_catalog_id ~ '^[a-z0-9][a-z0-9:_-]{0,199}$');

alter table public.discord_skin_claim_catalog_locks
  drop constraint if exists discord_skin_claim_catalog_locks_skin_catalog_id_check;

alter table public.discord_skin_claim_catalog_locks
  add constraint discord_skin_claim_catalog_locks_skin_catalog_id_check
  check (skin_catalog_id ~ '^[a-z0-9][a-z0-9:_-]{0,199}$');

alter table public.discord_skin_claim_drops
  add column if not exists collection_type text not null default 'skin'
    check (collection_type in ('skin', 'item', 'rune')),
  add column if not exists collection_tier smallint
    check (collection_tier is null or collection_tier between 1 and 5),
  add column if not exists collection_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(collection_metadata) = 'object');

alter table public.discord_skin_claim_drops
  add constraint discord_skin_claim_drops_collection_type_tier_check
  check (
    (collection_type = 'skin' and collection_tier is null)
    or (collection_type in ('item', 'rune') and collection_tier between 1 and 5)
  );

-- Manual item and rune drops retain the existing one-live-drop, four-digit
-- identifier, collection-capacity, and catalogue-lock invariants. The old
-- skin-specific reservation RPCs remain unchanged for automatic, summon, and
-- gamble drops so their configured skin rarity weights keep their behavior.
create function public.force_reserve_discord_collection_drop(
  p_guild_id text,
  p_channel_id text,
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
  v_skin_code integer;
  v_drop_id bigint;
  v_expires_at timestamptz;
  v_internal_rarity text;
  v_attempt integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and channel identifiers must be valid snowflakes.';
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
  if (p_collection_type = 'rune' and p_collection_tier not between 2 and 4) then
    raise exception 'Rune collection tiers must be between 2 and 4.';
  end if;

  v_internal_rarity := case p_collection_tier
    when 1 then 'Common'
    when 2 then 'Rare'
    when 3 then 'Epic'
    when 4 then 'Legendary'
    else 'Mythic'
  end;

  -- This lock serializes manual non-skin drops with every existing drop path.
  select * into v_settings
  from public.discord_skin_claim_settings
  where guild_id = p_guild_id
  for update;
  if not found or not v_settings.enabled then
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
        p_image_url, 'manual', now() + make_interval(mins => v_settings.claim_window_minutes),
        p_collection_type, p_collection_tier, coalesce(p_collection_metadata, '{}'::jsonb)
      ) returning new_drop.id, new_drop.expires_at into v_drop_id, v_expires_at;
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A four-digit code or catalogue entry is already active or owned.
    end;
  end loop;

  raise exception 'No four-digit collection IDs are currently available.';
end;
$$;

-- Returning the collection type and tier lets reaction updates keep the
-- correct item/rune presentation after a member claims a drop.
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
  collection_tier smallint
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
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier;
    return;
  end if;
  if v_drop.claim_grace_discord_user_id is not null
    and v_drop.claim_grace_expires_at > now()
    and v_drop.claim_grace_discord_user_id <> p_discord_user_id then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier;
    return;
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier;
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
  where id = v_drop.id;
  return query select true, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier;
end;
$$;

revoke all on function public.force_reserve_discord_collection_drop(text, text, text, text, text, smallint, text, jsonb) from public;
revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
grant execute on function public.force_reserve_discord_collection_drop(text, text, text, text, text, smallint, text, jsonb) to service_role;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
