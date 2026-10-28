begin;

alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_force', 'collection_summon_refund',
    'collection_capacity_add', 'collection_sell', 'collection_steal', 'collection_upkeep',
    'collection_upkeep_allocation', 'fishing_expedition', 'fishing_shop_purchase',
    'fishing_chest_open', 'fishing_crate_open', 'fishing_level_up', 'coinflip_win',
    'coinflip_loss', 'snipe', 'message_lottery', 'disboard_bump', 'player_shop_purchase',
    'robbery_success', 'robbery_loss', 'robbery_failure', 'robbery_defense',
    'mining_sale', 'mining_shop_purchase'
  ));

create table public.discord_mining_players (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

create table public.discord_mining_player_upgrades (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  upgrade_id text not null check (upgrade_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  acquired_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, upgrade_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_mining_players(guild_id, discord_user_id) on delete cascade
);

create table public.discord_game_resource_inventory (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  resource_id text not null check (resource_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  quantity integer not null check (quantity between 1 and 1000000000),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, resource_id)
);

create table public.discord_game_material_processors (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  processor_tier smallint not null check (processor_tier between 1 and 6),
  acquired_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, processor_tier)
);

create table public.discord_mining_expeditions (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  depth smallint not null check (depth between 1 and 7),
  started_at timestamptz not null default now(),
  mining_started_at timestamptz not null,
  return_started_at timestamptz,
  returns_at timestamptz,
  status text not null default 'descending' check (status in ('descending', 'returning', 'completed')),
  outcome_seed integer not null check (outcome_seed between 1 and 2147483647),
  equipment_snapshot jsonb not null check (jsonb_typeof(equipment_snapshot) = 'object' and octet_length(equipment_snapshot::text) <= 8192),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 32768)),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, discord_user_id)
    references public.discord_mining_players(guild_id, discord_user_id) on delete cascade,
  check (
    (status = 'descending' and return_started_at is null and returns_at is null and result is null and settled_at is null)
    or (status = 'returning' and return_started_at is not null and returns_at is not null and settled_at is null)
    or (status = 'completed' and return_started_at is not null and returns_at is not null and result is not null and settled_at is not null)
  ),
  check (mining_started_at >= started_at),
  check (returns_at is null or returns_at >= return_started_at)
);

create unique index discord_mining_expeditions_one_active_idx
  on public.discord_mining_expeditions (guild_id, discord_user_id)
  where status in ('descending', 'returning');

create index discord_mining_expeditions_history_idx
  on public.discord_mining_expeditions (guild_id, discord_user_id, settled_at desc, id desc);

alter table public.discord_mining_players enable row level security;
alter table public.discord_mining_player_upgrades enable row level security;
alter table public.discord_game_resource_inventory enable row level security;
alter table public.discord_game_material_processors enable row level security;
alter table public.discord_mining_expeditions enable row level security;
revoke all on table public.discord_mining_players from anon, authenticated;
revoke all on table public.discord_mining_player_upgrades from anon, authenticated;
revoke all on table public.discord_game_resource_inventory from anon, authenticated;
revoke all on table public.discord_game_material_processors from anon, authenticated;
revoke all on table public.discord_mining_expeditions from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_players to service_role;
grant select, insert, update, delete on table public.discord_mining_player_upgrades to service_role;
grant select, insert, update, delete on table public.discord_game_resource_inventory to service_role;
grant select, insert, update, delete on table public.discord_game_material_processors to service_role;
grant select, insert, update, delete on table public.discord_mining_expeditions to service_role;

create function public.ensure_discord_mining_player(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  insert into public.discord_mining_players (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  insert into public.discord_mining_player_upgrades (guild_id, discord_user_id, upgrade_id)
  values
    (p_guild_id, p_discord_user_id, 'wooden-pickaxe'),
    (p_guild_id, p_discord_user_id, 'shabby-bin')
  on conflict (guild_id, discord_user_id, upgrade_id) do nothing;

  insert into public.discord_game_skill_progress (guild_id, discord_user_id, skill_id, total_xp, level)
  values (p_guild_id, p_discord_user_id, 'mining', 0, 0)
  on conflict (guild_id, discord_user_id, skill_id) do nothing;
end;
$$;

create function public.start_discord_mining_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_depth smallint,
  p_descend_duration_ms integer,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb
)
returns table (expedition_id bigint, mining_started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expedition_id bigint;
  v_mining_started_at timestamptz;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_depth not between 1 and 7 or p_descend_duration_ms not between 1000 and 1800000
    or p_outcome_seed not between 1 and 2147483647
    or jsonb_typeof(p_equipment_snapshot) <> 'object' or octet_length(p_equipment_snapshot::text) > 8192 then
    raise exception 'Mining expedition data is invalid.';
  end if;

  perform public.ensure_discord_mining_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  insert into public.discord_mining_expeditions (
    guild_id, discord_user_id, depth, mining_started_at, outcome_seed, equipment_snapshot
  ) values (
    p_guild_id, p_discord_user_id, p_depth,
    now() + make_interval(secs => p_descend_duration_ms::double precision / 1000),
    p_outcome_seed, p_equipment_snapshot
  )
  returning id, discord_mining_expeditions.mining_started_at into v_expedition_id, v_mining_started_at;

  return query select v_expedition_id, v_mining_started_at;
exception
  when unique_violation then
    raise exception 'You already have an active mining expedition.';
end;
$$;

create function public.begin_discord_mining_return(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_ascent_duration_ms integer
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
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or p_ascent_duration_ms not between 1000 and 1800000 then
    raise exception 'Mining return data is invalid.';
  end if;

  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  if not found then
    raise exception 'Mining profile is unavailable.';
  end if;

  select * into v_expedition
  from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id
    and expeditions.guild_id = p_guild_id
    and expeditions.discord_user_id = p_discord_user_id
  for update;
  if not found or v_expedition.status <> 'descending' then
    raise exception 'That mining expedition cannot be recalled.';
  end if;
  if v_expedition.mining_started_at > now() then
    raise exception 'Your minecart is still descending. Wait until it reaches the mining depth before recalling it.';
  end if;

  update public.discord_mining_expeditions as expeditions
  set status = 'returning',
      return_started_at = now(),
      returns_at = now() + make_interval(secs => p_ascent_duration_ms::double precision / 1000),
      updated_at = now()
  where expeditions.id = v_expedition.id
  returning * into v_expedition;

  return query select
    v_expedition.id,
    v_expedition.depth,
    v_expedition.mining_started_at,
    v_expedition.return_started_at,
    v_expedition.returns_at,
    v_expedition.outcome_seed,
    v_expedition.equipment_snapshot;
end;
$$;

create function public.record_discord_mining_return_result(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_result jsonb;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or jsonb_typeof(p_result) <> 'object'
    or jsonb_typeof(p_result -> 'cargo') <> 'array'
    or coalesce((p_result ->> 'miningXpAwarded') ~ '^[0-9]+$', false) = false
    or (p_result ->> 'miningXpAwarded')::bigint not between 0 and 5000000
    or octet_length(p_result::text) > 32768 then
    raise exception 'Mining return result is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_result -> 'cargo') as cargo(value)
    where coalesce(cargo.value ->> 'id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(cargo.value ->> 'kind' in ('ore', 'gem', 'fossil'), false) = false
      or coalesce(char_length(cargo.value ->> 'name') between 1 and 100, false) = false
      or coalesce(cargo.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (cargo.value ->> 'quantity')::integer > 1000000
  ) then
    raise exception 'Mining return cargo is invalid.';
  end if;

  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  if not found then
    raise exception 'Mining profile is unavailable.';
  end if;
  select expeditions.result into v_existing_result
  from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id
    and expeditions.guild_id = p_guild_id
    and expeditions.discord_user_id = p_discord_user_id
    and expeditions.status = 'returning'
  for update;
  if not found then
    raise exception 'That mining return is unavailable.';
  end if;
  if v_existing_result is not null then
    return true;
  end if;

  update public.discord_mining_expeditions as expeditions
  set result = p_result,
      updated_at = now()
  where expeditions.id = p_expedition_id;
  return true;
end;
$$;

create function public.settle_discord_mining_expedition(
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
  v_resource_id text;
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
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  if not found then
    raise exception 'Mining profile is unavailable.';
  end if;
  select * into v_expedition
  from public.discord_mining_expeditions as expeditions
  where expeditions.id = p_expedition_id
    and expeditions.guild_id = p_guild_id
    and expeditions.discord_user_id = p_discord_user_id
  for update;
  if not found or v_expedition.status <> 'returning' or v_expedition.returns_at > now() or v_expedition.result is null then
    return query select false, null::jsonb, 0::bigint, null::integer, null::integer, null::bigint;
    return;
  end if;

  v_xp_awarded := (v_expedition.result ->> 'miningXpAwarded')::bigint;
  for v_cargo in select cargo.value from jsonb_array_elements(v_expedition.result -> 'cargo') as cargo(value)
  loop
    v_resource_id := v_cargo ->> 'id';
    v_quantity := (v_cargo ->> 'quantity')::integer;
    insert into public.discord_game_resource_inventory as inventory (guild_id, discord_user_id, resource_id, quantity)
    values (p_guild_id, p_discord_user_id, v_resource_id, v_quantity)
    on conflict (guild_id, discord_user_id, resource_id) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now();
  end loop;

  insert into public.discord_game_skill_progress (guild_id, discord_user_id, skill_id, total_xp, level)
  values (p_guild_id, p_discord_user_id, 'mining', 0, 0)
  on conflict (guild_id, discord_user_id, skill_id) do nothing;
  select skills.level, skills.total_xp
  into v_previous_level, v_total_xp
  from public.discord_game_skill_progress as skills
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining'
  for update;
  v_total_xp := v_total_xp + v_xp_awarded;
  v_current_level := public.discord_game_skill_level_for_total_xp(v_total_xp);
  update public.discord_game_skill_progress as skills
  set level = v_current_level,
      total_xp = v_total_xp,
      updated_at = now()
  where skills.guild_id = p_guild_id and skills.discord_user_id = p_discord_user_id and skills.skill_id = 'mining';

  update public.discord_mining_expeditions as expeditions
  set status = 'completed', settled_at = now(), updated_at = now()
  where expeditions.id = v_expedition.id;

  return query select true, v_expedition.result, v_xp_awarded, v_previous_level, v_current_level, v_total_xp;
end;
$$;

create function public.purchase_discord_mining_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_upgrade_id text,
  p_resource_cost jsonb,
  p_knowbucks_cost bigint,
  p_processor_tier smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost jsonb;
  v_resource_id text;
  v_quantity integer;
  v_owned_upgrade text;
  v_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_upgrade_id !~ '^[a-z][a-z0-9-]{0,63}$' or jsonb_typeof(p_resource_cost) <> 'array'
    or p_knowbucks_cost not between 0 and 1000000000 or p_processor_tier not between 0 and 6
    or octet_length(p_resource_cost::text) > 8192 then
    raise exception 'Mining purchase data is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_resource_cost) as costs(value)
    where coalesce(costs.value ->> 'resource_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(costs.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (costs.value ->> 'quantity')::integer > 1000000
  ) then
    raise exception 'Mining crafting cost is invalid.';
  end if;

  perform public.ensure_discord_mining_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  select upgrades.upgrade_id into v_owned_upgrade
  from public.discord_mining_player_upgrades as upgrades
  where upgrades.guild_id = p_guild_id and upgrades.discord_user_id = p_discord_user_id and upgrades.upgrade_id = p_upgrade_id;
  if found then
    raise exception 'You already own that mining upgrade.';
  end if;

  for v_cost in select costs.value from jsonb_array_elements(p_resource_cost) as costs(value)
  loop
    v_resource_id := v_cost ->> 'resource_id';
    v_quantity := (v_cost ->> 'quantity')::integer;
    perform 1 from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'You do not have the required mining materials.';
    end if;
  end loop;

  if p_knowbucks_cost > 0 then
    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (p_guild_id, p_discord_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    select balances.balance into v_balance
    from public.discord_knowbucks_balances as balances
    where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
    for update;
    if v_balance < p_knowbucks_cost then
      raise exception 'Insufficient KnowBucks balance.';
    end if;
  end if;

  for v_cost in select costs.value from jsonb_array_elements(p_resource_cost) as costs(value)
  loop
    v_resource_id := v_cost ->> 'resource_id';
    v_quantity := (v_cost ->> 'quantity')::integer;
    update public.discord_game_resource_inventory as inventory
    set quantity = inventory.quantity - v_quantity, updated_at = now()
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id;
    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id and inventory.quantity = 0;
  end loop;
  if p_knowbucks_cost > 0 then
    v_balance := v_balance - p_knowbucks_cost;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance, updated_at = now()
    where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id;
    insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
    values (p_guild_id, p_discord_user_id, -p_knowbucks_cost, v_balance, 'mining_shop_purchase');
  end if;
  insert into public.discord_mining_player_upgrades (guild_id, discord_user_id, upgrade_id)
  values (p_guild_id, p_discord_user_id, p_upgrade_id);
  if p_processor_tier > 0 then
    insert into public.discord_game_material_processors (guild_id, discord_user_id, processor_tier)
    values (p_guild_id, p_discord_user_id, p_processor_tier)
    on conflict (guild_id, discord_user_id, processor_tier) do nothing;
  end if;
end;
$$;

create function public.sell_discord_mining_resources(
  p_guild_id text,
  p_discord_user_id text,
  p_resources jsonb,
  p_knowbucks_awarded bigint
)
returns table (current_balance bigint, sold_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_resource_id text;
  v_quantity integer;
  v_balance bigint;
  v_sold_count integer := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or jsonb_typeof(p_resources) <> 'array' or p_knowbucks_awarded not between 1 and 1000000000
    or octet_length(p_resources::text) > 8192 then
    raise exception 'Mining sale data is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_resources) as resources(value)
    where coalesce(resources.value ->> 'resource_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(resources.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (resources.value ->> 'quantity')::integer > 1000000000
  ) then
    raise exception 'Mining sale resources are invalid.';
  end if;

  perform public.ensure_discord_mining_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_mining_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  for v_item in select resources.value from jsonb_array_elements(p_resources) as resources(value)
  loop
    v_resource_id := v_item ->> 'resource_id';
    v_quantity := (v_item ->> 'quantity')::integer;
    perform 1 from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'A mining resource changed before it could be sold.';
    end if;
  end loop;
  for v_item in select resources.value from jsonb_array_elements(p_resources) as resources(value)
  loop
    v_resource_id := v_item ->> 'resource_id';
    v_quantity := (v_item ->> 'quantity')::integer;
    v_sold_count := v_sold_count + v_quantity;
    update public.discord_game_resource_inventory as inventory
    set quantity = inventory.quantity - v_quantity, updated_at = now()
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id;
    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.resource_id = v_resource_id and inventory.quantity = 0;
  end loop;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  v_balance := v_balance + p_knowbucks_awarded;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance, updated_at = now()
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, p_knowbucks_awarded, v_balance, 'mining_sale');

  return query select v_balance, v_sold_count;
end;
$$;

revoke all on function public.ensure_discord_mining_player(text, text) from public;
revoke all on function public.start_discord_mining_expedition(text, text, smallint, integer, integer, jsonb) from public;
revoke all on function public.begin_discord_mining_return(text, text, bigint, integer) from public;
revoke all on function public.record_discord_mining_return_result(text, text, bigint, jsonb) from public;
revoke all on function public.settle_discord_mining_expedition(text, text, bigint) from public;
revoke all on function public.purchase_discord_mining_upgrade(text, text, text, jsonb, bigint, smallint) from public;
revoke all on function public.sell_discord_mining_resources(text, text, jsonb, bigint) from public;
grant execute on function public.ensure_discord_mining_player(text, text) to service_role;
grant execute on function public.start_discord_mining_expedition(text, text, smallint, integer, integer, jsonb) to service_role;
grant execute on function public.begin_discord_mining_return(text, text, bigint, integer) to service_role;
grant execute on function public.record_discord_mining_return_result(text, text, bigint, jsonb) to service_role;
grant execute on function public.settle_discord_mining_expedition(text, text, bigint) to service_role;
grant execute on function public.purchase_discord_mining_upgrade(text, text, text, jsonb, bigint, smallint) to service_role;
grant execute on function public.sell_discord_mining_resources(text, text, jsonb, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
