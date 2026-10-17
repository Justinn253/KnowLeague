begin;

-- A successful gamble is user-triggered like /collections spawn and summon.
-- It may create a live drop but must not postpone the automatic drop schedule.
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
  return query select 'spawned'::text, v_owned_drop.skin_name, v_new_drop.drop_id, v_new_drop.skin_code, v_new_drop.expires_at;
end;
$$;

grant execute on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
