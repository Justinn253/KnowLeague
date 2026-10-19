begin;

-- This replacement rebalances Fishing level-up KnowBucks while preserving the
-- public settlement contract used by the five-argument bonus wrapper from
-- migration 170. The companion bot code snapshots the new XP scale as
-- catalogue version 6, preserving XP for expeditions already in progress.
create or replace function public.settle_discord_fishing_expedition(
  p_expedition_id bigint,
  p_result jsonb,
  p_knowbucks_awarded bigint,
  p_special_items jsonb
)
returns table (
  settled boolean,
  guild_id text,
  discord_user_id text,
  notification_channel_id text,
  result jsonb,
  knowbucks_awarded bigint,
  current_balance bigint,
  awarded_gear_item_ids jsonb,
  fishing_xp_awarded bigint,
  fishing_previous_level integer,
  fishing_current_level integer,
  fishing_total_xp bigint,
  fishing_knowbucks_awarded bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.discord_fishing_expeditions%rowtype;
  v_balance bigint;
  v_item jsonb;
  v_item_id text;
  v_quantity integer;
  v_awarded_item_id text;
  v_awarded_gear_item_ids jsonb := '[]'::jsonb;
  v_fishing_xp_awarded bigint := 0;
  v_fishing_previous_level integer := 0;
  v_fishing_current_level integer := 0;
  v_fishing_total_xp bigint := 0;
  v_fishing_knowbucks_awarded bigint := 0;
begin
  if p_expedition_id < 1 or p_knowbucks_awarded not between 0 and 1000000000
    or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result -> 'catches') <> 'array'
    or jsonb_typeof(p_special_items) <> 'array'
    or octet_length(p_result::text) > 32768 or octet_length(p_special_items::text) > 8192 then
    raise exception 'Fishing settlement data is invalid.';
  end if;
  if p_result ? 'fishingXpAwarded' then
    if jsonb_typeof(p_result -> 'fishingXpAwarded') <> 'number'
      or (p_result ->> 'fishingXpAwarded') !~ '^[0-9]+$' then
      raise exception 'Fishing XP award data is invalid.';
    end if;
    v_fishing_xp_awarded := (p_result ->> 'fishingXpAwarded')::bigint;
  end if;
  if v_fishing_xp_awarded not between 0 and 5000000 then
    raise exception 'Fishing XP award data is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_result -> 'catches') as catches(value)
    where catches.value ->> 'kind' = 'fish'
      and (
        coalesce(char_length(catches.value ->> 'name') between 1 and 100, false) = false
        or coalesce(catches.value ->> 'rarity' in ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'), false) = false
      )
  ) then
    raise exception 'Fishing catch data is invalid.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb, 0::bigint, null::integer, null::integer, null::bigint, 0::bigint;
    return;
  end if;

  perform 1
  from public.discord_fishing_players as players
  where players.guild_id = v_expedition.guild_id
    and players.discord_user_id = v_expedition.discord_user_id
  for update;
  if not found then
    raise exception 'Fishing profile is unavailable.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id
  for update;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb, 0::bigint, null::integer, null::integer, null::bigint, 0::bigint;
    return;
  end if;

  perform public.ensure_discord_fishing_skill(v_expedition.guild_id, v_expedition.discord_user_id);
  select skills.level, skills.total_xp
  into v_fishing_previous_level, v_fishing_total_xp
  from public.discord_game_skill_progress as skills
  where skills.guild_id = v_expedition.guild_id
    and skills.discord_user_id = v_expedition.discord_user_id
    and skills.skill_id = 'fishing'
  for update;
  if not found then
    raise exception 'Fishing skill profile is unavailable.';
  end if;
  v_fishing_total_xp := v_fishing_total_xp + v_fishing_xp_awarded;
  v_fishing_current_level := public.discord_game_skill_level_for_total_xp(v_fishing_total_xp);
  select coalesce(sum(greatest(
    250::bigint,
    public.discord_game_skill_total_xp_for_level(levels.level)
      - public.discord_game_skill_total_xp_for_level(levels.level - 1)
  )), 0)::bigint
  into v_fishing_knowbucks_awarded
  from generate_series(v_fishing_previous_level + 1, v_fishing_current_level) as levels(level);
  update public.discord_game_skill_progress as skills
  set total_xp = v_fishing_total_xp,
      level = v_fishing_current_level,
      updated_at = now()
  where skills.guild_id = v_expedition.guild_id
    and skills.discord_user_id = v_expedition.discord_user_id
    and skills.skill_id = 'fishing';

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (v_expedition.guild_id, v_expedition.discord_user_id)
  on conflict on constraint discord_knowbucks_balances_pkey do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = v_expedition.guild_id
    and balances.discord_user_id = v_expedition.discord_user_id
  for update;

  if p_knowbucks_awarded > 0 then
    v_balance := v_balance + p_knowbucks_awarded;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance, updated_at = now()
    where balances.guild_id = v_expedition.guild_id and balances.discord_user_id = v_expedition.discord_user_id;
    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source
    ) values (
      v_expedition.guild_id, v_expedition.discord_user_id,
      p_knowbucks_awarded, v_balance, 'fishing_expedition'
    );
  end if;
  if v_fishing_knowbucks_awarded > 0 then
    v_balance := v_balance + v_fishing_knowbucks_awarded;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance, updated_at = now()
    where balances.guild_id = v_expedition.guild_id and balances.discord_user_id = v_expedition.discord_user_id;
    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source, level_from, level_to
    ) values (
      v_expedition.guild_id, v_expedition.discord_user_id,
      v_fishing_knowbucks_awarded, v_balance, 'fishing_level_up',
      v_fishing_previous_level, v_fishing_current_level
    );
  end if;

  for v_item in select items.value from jsonb_array_elements(p_special_items) as items
  loop
    v_item_id := v_item ->> 'itemId';
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_item_id !~ '^[a-z0-9-]{1,64}$' or v_quantity not between 1 and 1000 then
      raise exception 'Fishing special item data is invalid.';
    end if;
    if v_item_id like 'gear-%' then
      insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
      values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, 1)
      on conflict on constraint discord_fishing_inventory_pkey do nothing
      returning item_id into v_awarded_item_id;
      if found then
        v_awarded_gear_item_ids := v_awarded_gear_item_ids || jsonb_build_array(v_awarded_item_id);
      end if;
    else
      insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
      values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, v_quantity)
      on conflict on constraint discord_fishing_inventory_pkey do update
      set quantity = public.discord_fishing_inventory.quantity + excluded.quantity,
          updated_at = now();
    end if;
  end loop;

  insert into public.discord_fishing_catalogue_catches as catalogue (
    guild_id, discord_user_id, biome_id, fish_name, fish_rarity, first_caught_at, last_caught_at
  )
  select
    v_expedition.guild_id,
    v_expedition.discord_user_id,
    v_expedition.biome_id,
    catches.value ->> 'name',
    catches.value ->> 'rarity',
    now(),
    now()
  from jsonb_array_elements(p_result -> 'catches') as catches(value)
  where catches.value ->> 'kind' = 'fish'
    and v_expedition.biome_id in (
      'harbor', 'warm-ocean', 'hydroplant-reservoir', 'sunken-sea',
      'kelp-forest', 'crystaline-caverns', 'rallypoint-delta'
    )
  group by catches.value ->> 'name', catches.value ->> 'rarity'
  on conflict on constraint discord_fishing_catalogue_catches_pkey do update
  set last_caught_at = excluded.last_caught_at;

  update public.discord_fishing_expeditions as expeditions
  set status = 'completed',
      result = p_result,
      knowbucks_awarded = p_knowbucks_awarded,
      settled_at = now(),
      updated_at = now()
  where expeditions.id = v_expedition.id;

  return query select
    true,
    v_expedition.guild_id,
    v_expedition.discord_user_id,
    v_expedition.notification_channel_id,
    p_result,
    p_knowbucks_awarded,
    v_balance,
    v_awarded_gear_item_ids,
    v_fishing_xp_awarded,
    v_fishing_previous_level,
    v_fishing_current_level,
    v_fishing_total_xp,
    v_fishing_knowbucks_awarded;
end;
$$;

revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
