begin;

alter table public.discord_fishing_players
  add column if not exists crew_one_unlocked boolean not null default false,
  add column if not exists crew_two_unlocked boolean not null default false;

alter table public.discord_fishing_expeditions
  drop constraint if exists discord_fishing_expeditions_duration_tier_check;

alter table public.discord_fishing_expeditions
  add constraint discord_fishing_expeditions_duration_tier_check
  check (duration_tier between 1 and 4);

-- The initial crew-slot field remains for historical rows, but new progression
-- is represented by the two level-gated crew contracts above. This avoids
-- changing or deleting experimental inventory that may already exist.
drop function if exists public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb);

create function public.start_discord_fishing_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_crew_slot smallint,
  p_biome_id text,
  p_duration_tier smallint,
  p_duration_seconds integer,
  p_notification_channel_id text,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb
)
returns table (expedition_id bigint, completes_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crew_one_unlocked boolean;
  v_crew_two_unlocked boolean;
  v_completes_at timestamptz;
  v_expedition_id bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_notification_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, user, and channel identifiers must be valid snowflakes.';
  end if;
  if p_crew_slot not between 1 and 3 or p_duration_tier not between 1 and 4 then
    raise exception 'Fishing crew slot and duration tier are invalid.';
  end if;
  if p_duration_seconds not between 30 and 86400 then
    raise exception 'Fishing expedition duration must be between thirty seconds and one day.';
  end if;
  if p_biome_id !~ '^[a-z0-9-]{1,64}$' or p_outcome_seed not between 1 and 2147483647
    or jsonb_typeof(p_equipment_snapshot) <> 'object' or octet_length(p_equipment_snapshot::text) > 8192 then
    raise exception 'Fishing expedition data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select crew_one_unlocked, crew_two_unlocked
  into v_crew_one_unlocked, v_crew_two_unlocked
  from public.discord_fishing_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if p_crew_slot = 2 and not v_crew_one_unlocked then
    raise exception 'Crew 1 has not been unlocked.';
  end if;
  if p_crew_slot = 3 and not v_crew_two_unlocked then
    raise exception 'Crew 2 has not been unlocked.';
  end if;

  insert into public.discord_fishing_expeditions (
    guild_id, discord_user_id, crew_slot, biome_id, duration_tier, completes_at,
    notification_channel_id, outcome_seed, equipment_snapshot
  ) values (
    p_guild_id, p_discord_user_id, p_crew_slot, p_biome_id, p_duration_tier,
    now() + make_interval(secs => p_duration_seconds), p_notification_channel_id,
    p_outcome_seed, p_equipment_snapshot
  )
  returning id, public.discord_fishing_expeditions.completes_at into v_expedition_id, v_completes_at;
  return query select v_expedition_id, v_completes_at;
exception
  when unique_violation then
    raise exception 'That crew slot is already on an expedition.';
end;
$$;

drop function if exists public.purchase_discord_fishing_upgrade(text, text, text, text, bigint);

create function public.purchase_discord_fishing_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text,
  p_category text,
  p_cost bigint,
  p_required_chat_level integer
)
returns table (current_balance bigint, crew_slots smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_chat_level integer := 1;
  v_crew_one_unlocked boolean;
  v_crew_two_unlocked boolean;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_item_id !~ '^[a-z0-9-]{1,64}$' or p_category not in ('rod', 'bait', 'boat', 'gear', 'skill', 'crew')
    or p_cost not between 1 and 1000000000 or p_required_chat_level not between 1 and 10000 then
    raise exception 'Fishing shop purchase data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select crew_one_unlocked, crew_two_unlocked
  into v_crew_one_unlocked, v_crew_two_unlocked
  from public.discord_fishing_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  select level into v_chat_level
  from public.discord_leveling_members
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  v_chat_level := coalesce(v_chat_level, 1);
  if v_chat_level < p_required_chat_level then
    raise exception 'This fishing upgrade requires chat level %.', p_required_chat_level;
  end if;
  if exists (
    select 1 from public.discord_fishing_inventory
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id
  ) then
    raise exception 'You already own that fishing upgrade.';
  end if;
  if p_category = 'crew' and p_item_id = 'crew-2' and not v_crew_one_unlocked then
    raise exception 'Crew 1 must be unlocked before Crew 2.';
  end if;
  if p_category = 'crew' and p_item_id not in ('crew-1', 'crew-2') then
    raise exception 'Fishing crew data is invalid.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_balance < p_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id)
  values (p_guild_id, p_discord_user_id, p_item_id);
  update public.discord_knowbucks_balances
  set balance = v_balance - p_cost, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  v_balance := v_balance - p_cost;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_cost, v_balance, 'fishing_shop_purchase');

  if p_category = 'rod' then
    update public.discord_fishing_players set equipped_rod_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'bait' then
    update public.discord_fishing_players set equipped_bait_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_item_id = 'crew-1' then
    update public.discord_fishing_players set crew_one_unlocked = true, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
    v_crew_one_unlocked := true;
  elsif p_item_id = 'crew-2' then
    update public.discord_fishing_players set crew_two_unlocked = true, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
    v_crew_two_unlocked := true;
  end if;

  return query select v_balance, (1 + v_crew_one_unlocked::integer + v_crew_two_unlocked::integer)::smallint;
end;
$$;

revoke all on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) from public;
revoke all on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint, integer) from public;
grant execute on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) to service_role;
grant execute on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint, integer) to service_role;

notify pgrst, 'reload schema';

commit;
