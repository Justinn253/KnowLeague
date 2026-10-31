begin;

-- Migration 200 added claimed_at to the RPC's return table. In PL/pgSQL that
-- output name shares a namespace with an unqualified RETURNING claimed_at
-- reference, causing otherwise valid claim attempts to abort. Qualify the
-- table column so the stored claim timestamp is returned deterministically.
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

  update public.discord_skin_claim_drops as claimed_drop
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
  where claimed_drop.id = v_drop.id
  returning claimed_drop.claimed_at into v_claimed_at;
  return query select true, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url, v_drop.collection_type, v_drop.collection_tier, v_claimed_at;
end;
$$;

revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
