begin;

-- Staff spawns and paid summons are convenience drops. They retain the automatic
-- schedule established by the last scheduled or chat-triggered drop.
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

  -- The lock keeps every reservation serialized, but last_drop_at belongs to
  -- the automatic schedule and intentionally remains unchanged here.
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
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A live or collected item already owns this four-digit code. Try another.
    end;
  end loop;

  raise exception 'No four-digit skin-claim IDs are currently available.';
end;
$$;

-- The shared manual reservation no longer changes the schedule. Preserve that
-- behavior for a successful gamble, which remains a game-generated drop.
create or replace function public.gamble_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer,
  p_channel_id text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text
)
returns table (outcome text, skin_name text, drop_id bigint, new_skin_code integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_drop public.discord_skin_claim_drops%rowtype;
  v_active_drop public.discord_skin_claim_drops%rowtype;
  v_new_drop record;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' or p_skin_code not between 1000 and 9999 then
    raise exception 'Discord user identifier and skin ID must be valid.';
  end if;
  select * into v_owned_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id
    and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  -- Never consume a collection item when another live drop blocks the gamble.
  select * into v_active_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and status = 'pending'
  for update;
  if found then
    if v_active_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_active_drop.id;
    else
      return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
      return;
    end if;
  end if;

  if random() >= 0.25 then
    delete from public.discord_skin_claim_drops where id = v_owned_drop.id;
    return query select 'lost'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
    return;
  end if;

  select * into v_new_drop from public.force_reserve_discord_skin_claim_drop(
    p_guild_id, p_channel_id, p_skin_catalog_id, p_skin_name, p_champion_name,
    p_rarity, p_release_date, p_skin_line, p_image_url
  );
  if not found then
    return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
    return;
  end if;
  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  delete from public.discord_skin_claim_drops where id = v_owned_drop.id;
  update public.discord_skin_claim_drops
  set claim_grace_discord_user_id = p_discord_user_id,
      claim_grace_expires_at = now() + make_interval(secs => v_economy.claim_grace_period_seconds)
  where id = v_new_drop.drop_id;
  update public.discord_skin_claim_settings
  set last_drop_at = now(), updated_at = now()
  where guild_id = p_guild_id;
  return query select 'spawned'::text, v_owned_drop.skin_name, v_new_drop.drop_id, v_new_drop.skin_code, v_new_drop.expires_at;
end;
$$;

grant execute on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
