begin;

alter table public.discord_mining_expeditions
  add column event_state jsonb;

alter table public.discord_mining_expeditions
  add constraint discord_mining_expeditions_event_state_check
  check (
    event_state is null
    or (
      jsonb_typeof(event_state) = 'object'
      and octet_length(event_state::text) <= 2048
      and coalesce(event_state ->> 'version' = '1', false)
      and coalesce(event_state ->> 'id' in ('lost-temple', 'ore-vein', 'gem-cluster', 'damaged-gear', 'arcane-rift', 'energy-crystals', 'old-dynamite', 'quantum-fluctuations'), false)
      and coalesce(event_state ->> 'trigger' in ('half-cart', 'full-cart', 'timed'), false)
      and coalesce(event_state ->> 'status' in ('scheduled', 'active', 'resolved', 'expired'), false)
      and coalesce(event_state ->> 'triggerDelayMs' ~ '^[0-9]{1,9}$', false)
    )
  );

create function public.start_discord_mining_expedition_with_event(
  p_guild_id text,
  p_discord_user_id text,
  p_depth smallint,
  p_descend_duration_ms integer,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb,
  p_event_state jsonb
)
returns table (expedition_id bigint, mining_started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started record;
begin
  if p_event_state is not null and (
    jsonb_typeof(p_event_state) <> 'object'
    or octet_length(p_event_state::text) > 2048
    or coalesce(p_event_state ->> 'version' = '1', false) = false
    or coalesce(p_event_state ->> 'status' = 'scheduled', false) = false
    or coalesce(p_event_state ->> 'id' in ('lost-temple', 'ore-vein', 'gem-cluster', 'damaged-gear', 'arcane-rift', 'energy-crystals', 'old-dynamite', 'quantum-fluctuations'), false) = false
    or coalesce(p_event_state ->> 'trigger' in ('half-cart', 'full-cart', 'timed'), false) = false
    or coalesce(p_event_state ->> 'triggerDelayMs' ~ '^[0-9]{1,9}$', false) = false
  ) then
    raise exception 'Mining event data is invalid.';
  end if;

  select * into v_started
  from public.start_discord_mining_expedition(
    p_guild_id, p_discord_user_id, p_depth, p_descend_duration_ms, p_outcome_seed, p_equipment_snapshot
  );

  update public.discord_mining_expeditions
  set event_state = p_event_state,
      updated_at = now()
  where id = v_started.expedition_id
    and guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  return query select v_started.expedition_id, v_started.mining_started_at;
end;
$$;

create function public.update_discord_mining_expedition_event(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_expected_status text,
  p_event_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or p_expected_status not in ('scheduled', 'active')
    or jsonb_typeof(p_event_state) <> 'object' or octet_length(p_event_state::text) > 2048
    or coalesce(p_event_state ->> 'version' = '1', false) = false
    or coalesce(p_event_state ->> 'id' in ('lost-temple', 'ore-vein', 'gem-cluster', 'damaged-gear', 'arcane-rift', 'energy-crystals', 'old-dynamite', 'quantum-fluctuations'), false) = false
    or coalesce(p_event_state ->> 'trigger' in ('half-cart', 'full-cart', 'timed'), false) = false
    or coalesce(p_event_state ->> 'status' in ('active', 'resolved', 'expired'), false) = false
    or coalesce(p_event_state ->> 'triggerDelayMs' ~ '^[0-9]{1,9}$', false) = false then
    raise exception 'Mining event data is invalid.';
  end if;

  update public.discord_mining_expeditions as expeditions
  set event_state = p_event_state,
      updated_at = now()
  where expeditions.id = p_expedition_id
    and expeditions.guild_id = p_guild_id
    and expeditions.discord_user_id = p_discord_user_id
    and expeditions.status = 'descending'
    and expeditions.event_state ->> 'status' = p_expected_status;
  return found;
end;
$$;

create function public.begin_discord_mining_return_instantly(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint
)
returns table (
  expedition_id bigint,
  depth smallint,
  mining_started_at timestamptz,
  return_started_at timestamptz,
  returns_at timestamptz,
  outcome_seed integer,
  equipment_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.discord_mining_expeditions%rowtype;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_expedition_id < 1 then
    raise exception 'Mining return data is invalid.';
  end if;
  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id for update;
  if not found then raise exception 'Mining profile is unavailable.'; end if;
  select * into v_expedition from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id and expeditions.guild_id = p_guild_id and expeditions.discord_user_id = p_discord_user_id for update;
  if not found or v_expedition.status <> 'descending' then raise exception 'That mining expedition cannot be recalled.'; end if;
  if v_expedition.mining_started_at > now() then raise exception 'Your minecart is still descending. Wait until it reaches the mining depth before recalling it.'; end if;
  update public.discord_mining_expeditions as expeditions
  set status = 'returning', return_started_at = now(), returns_at = now(), updated_at = now()
  where expeditions.id = v_expedition.id
  returning * into v_expedition;
  return query select v_expedition.id, v_expedition.depth, v_expedition.mining_started_at, v_expedition.return_started_at, v_expedition.returns_at, v_expedition.outcome_seed, v_expedition.equipment_snapshot;
end;
$$;

-- Temple rewards can be a Mining Relic or a Fishing Relic. The destination
-- table remains authoritative for each game so their existing inventories and
-- passive effects remain unchanged.
create or replace function public.settle_discord_mining_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint
)
returns table (
  settled boolean,
  result jsonb,
  mining_xp_awarded bigint,
  mining_previous_level integer,
  mining_current_level integer,
  mining_total_xp bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition public.discord_mining_expeditions%rowtype;
  v_cargo jsonb;
  v_gear jsonb;
  v_resource_id text;
  v_gear_item_id text;
  v_quantity integer;
  v_xp_awarded bigint;
  v_previous_level integer;
  v_current_level integer;
  v_total_xp bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_expedition_id < 1 then
    raise exception 'Mining settlement data is invalid.';
  end if;
  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id for update;
  if not found then raise exception 'Mining profile is unavailable.'; end if;
  select * into v_expedition from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id and expeditions.guild_id = p_guild_id and expeditions.discord_user_id = p_discord_user_id for update;
  if not found or v_expedition.status <> 'returning' or v_expedition.returns_at > now() or v_expedition.result is null then
    return query select false, null::jsonb, 0::bigint, null::integer, null::integer, null::bigint;
    return;
  end if;

  v_xp_awarded := (v_expedition.result ->> 'miningXpAwarded')::bigint;
  for v_cargo in select cargo.value from jsonb_array_elements(v_expedition.result -> 'cargo') as cargo(value) loop
    v_resource_id := v_cargo ->> 'id'; v_quantity := (v_cargo ->> 'quantity')::integer;
    insert into public.discord_game_resource_inventory as inventory (guild_id, discord_user_id, resource_id, quantity)
    values (p_guild_id, p_discord_user_id, v_resource_id, v_quantity)
    on conflict (guild_id, discord_user_id, resource_id) do update set quantity = inventory.quantity + excluded.quantity, updated_at = now();
  end loop;
  for v_gear in select gear.value from jsonb_array_elements(coalesce(v_expedition.result -> 'gearItems', '[]'::jsonb)) as gear(value) loop
    v_gear_item_id := v_gear ->> 'itemId';
    if coalesce(v_gear ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false or (v_gear ->> 'quantity')::integer <> 1 then
      raise exception 'Mining expedition relic data is invalid.';
    end if;
    v_quantity := 1;
    if v_gear_item_id = any (array[
      'mining-gear-bioluminescence', 'mining-gear-loaned-coin', 'mining-gear-melter', 'mining-gear-hardened-tip',
      'mining-gear-inspiring-photo', 'mining-gear-conveyor-belt', 'mining-gear-gem-bag', 'mining-gear-translocator',
      'mining-gear-paleontological-certificate', 'mining-gear-obsidian-dagger', 'mining-gear-ancient-refinery'
    ]) then
      insert into public.discord_player_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
      values (p_guild_id, p_discord_user_id, v_gear_item_id, v_quantity)
      on conflict (guild_id, discord_user_id, item_id) do update set quantity = greatest(inventory.quantity, excluded.quantity), updated_at = now();
    elsif v_gear_item_id = any (array[
      'gear-sea-star', 'gear-alien-engine', 'gear-dual-hook', 'gear-rod-improvement-kit', 'gear-lost-pursasion-device',
      'gear-conduit', 'gear-reservoir-growth', 'gear-giant-pearl', 'gear-magic-conch', 'gear-gemcracker', 'gear-teleporter',
      'gear-lucky-coin', 'gear-streak-charm', 'gear-early-bird-bell', 'gear-knowleague-lure', 'gear-dockhands-ledger',
      'gear-sunstone', 'gear-genesys-loop', 'gear-pearl-divers-log', 'gear-tangle-net', 'gear-crystal-resonator', 'gear-autopilot-relay'
    ]) then
      perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
      insert into public.discord_fishing_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
      values (p_guild_id, p_discord_user_id, v_gear_item_id, v_quantity)
      on conflict (guild_id, discord_user_id, item_id) do update set quantity = greatest(inventory.quantity, excluded.quantity), updated_at = now();
    else
      raise exception 'Mining expedition relic data is invalid.';
    end if;
  end loop;

  insert into public.discord_game_skill_progress (guild_id, discord_user_id, skill_id, total_xp, level)
  values (p_guild_id, p_discord_user_id, 'mining', 0, 0) on conflict (guild_id, discord_user_id, skill_id) do nothing;
  select skills.level, skills.total_xp into v_previous_level, v_total_xp from public.discord_game_skill_progress as skills
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining' for update;
  v_total_xp := v_total_xp + v_xp_awarded;
  v_current_level := public.discord_game_skill_level_for_total_xp(v_total_xp);
  update public.discord_game_skill_progress as skills set level = v_current_level, total_xp = v_total_xp, updated_at = now()
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining';
  update public.discord_mining_expeditions as expeditions set status = 'completed', settled_at = now(), updated_at = now() where expeditions.id = v_expedition.id;
  return query select true, v_expedition.result, v_xp_awarded, v_previous_level, v_current_level, v_total_xp;
end;
$$;

revoke all on function public.start_discord_mining_expedition_with_event(text, text, smallint, integer, integer, jsonb, jsonb) from public;
revoke all on function public.update_discord_mining_expedition_event(text, text, bigint, text, jsonb) from public;
revoke all on function public.begin_discord_mining_return_instantly(text, text, bigint) from public;
revoke all on function public.settle_discord_mining_expedition(text, text, bigint) from public;
grant execute on function public.start_discord_mining_expedition_with_event(text, text, smallint, integer, integer, jsonb, jsonb) to service_role;
grant execute on function public.update_discord_mining_expedition_event(text, text, bigint, text, jsonb) to service_role;
grant execute on function public.begin_discord_mining_return_instantly(text, text, bigint) to service_role;
grant execute on function public.settle_discord_mining_expedition(text, text, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
