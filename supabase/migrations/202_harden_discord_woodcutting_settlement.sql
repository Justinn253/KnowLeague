begin;

-- Woodcutting inventory and Mining resource inventory both require a positive
-- quantity. The first implementation decremented an exact-cost stack to zero
-- before deleting it, which PostgreSQL correctly rejected. That made an empty
-- sapling stack prevent claims and every action that settles work first.
-- Delete exact costs first, then decrement only rows that remain positive.
-- This also keeps every mutation atomic when Discord and the web companion
-- submit work at the same time.

create or replace function public.claim_discord_woodcutting_rewards(
  p_guild_id text,
  p_discord_user_id text,
  p_expected_last_claimed_at timestamptz,
  p_sapling_consumption jsonb,
  p_item_rewards jsonb,
  p_worker_remainders jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_claimed_at timestamptz;
  v_entry jsonb;
  v_item_id text;
  v_quantity integer;
  v_worker_number smallint;
  v_remainder integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expected_last_claimed_at is null
    or jsonb_typeof(p_sapling_consumption) <> 'array'
    or jsonb_typeof(p_item_rewards) <> 'array'
    or jsonb_typeof(p_worker_remainders) <> 'array'
    or octet_length(p_sapling_consumption::text) > 8192
    or octet_length(p_item_rewards::text) > 8192
    or octet_length(p_worker_remainders::text) > 4096 then
    raise exception 'Woodcutting claim data is invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sapling_consumption || p_item_rewards) as entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 100000000
  ) or exists (
    select 1
    from jsonb_array_elements(p_sapling_consumption) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_item_rewards) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_worker_remainders) as entries(value)
    where coalesce(entries.value ->> 'worker_number' ~ '^(10|[1-9])$', false) = false
      or coalesce(entries.value ->> 'chop_remainder_ms' ~ '^[0-9]+$', false) = false
      or (entries.value ->> 'chop_remainder_ms')::integer >= 60000
  ) or exists (
    select 1
    from jsonb_array_elements(p_worker_remainders) as entries(value)
    group by entries.value ->> 'worker_number'
    having count(*) > 1
  ) then
    raise exception 'Woodcutting claim rewards are invalid.';
  end if;

  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  select players.last_claimed_at into v_last_claimed_at
  from public.discord_woodcutting_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  if v_last_claimed_at is distinct from p_expected_last_claimed_at then
    raise exception 'Your Woodcutting progress changed before this claim could be saved. Please claim again.';
  end if;

  for v_entry in select entries.value from jsonb_array_elements(p_sapling_consumption) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1
    from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'A selected sapling stack changed before your Woodcutting claim could be saved.';
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_sapling_consumption) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;

    delete from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity = v_quantity;

    if not found then
      update public.discord_woodcutting_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.item_id = v_item_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'A selected sapling stack changed before your Woodcutting claim could be saved.';
      end if;
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_item_rewards) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    insert into public.discord_woodcutting_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
    values (p_guild_id, p_discord_user_id, v_item_id, v_quantity)
    on conflict (guild_id, discord_user_id, item_id) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now();
    insert into public.discord_woodcutting_catalogue_discoveries (guild_id, discord_user_id, item_id)
    values (p_guild_id, p_discord_user_id, v_item_id)
    on conflict (guild_id, discord_user_id, item_id) do nothing;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_worker_remainders) as entries(value)
  loop
    v_worker_number := (v_entry ->> 'worker_number')::smallint;
    v_remainder := (v_entry ->> 'chop_remainder_ms')::integer;
    update public.discord_woodcutting_workers as workers
    set chop_remainder_ms = v_remainder,
        updated_at = now()
    where workers.guild_id = p_guild_id
      and workers.discord_user_id = p_discord_user_id
      and workers.worker_number = v_worker_number;
    if not found then
      raise exception 'A lumberjack changed before your Woodcutting claim could be saved.';
    end if;
  end loop;

  update public.discord_woodcutting_players as players
  set last_claimed_at = now(),
      updated_at = now()
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  returning players.last_claimed_at into v_last_claimed_at;
  return v_last_claimed_at;
end;
$$;

-- Enforce the progressive price in the authoritative transaction. A stale
-- Discord/web state can no longer hire a later lumberjack at an earlier tier's
-- price when two requests arrive together.
create or replace function public.hire_discord_woodcutting_worker(
  p_guild_id text,
  p_discord_user_id text,
  p_knowbucks_cost bigint
)
returns table (worker_number smallint, starter_axe_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_number smallint;
  v_starter_axe_id bigint := null;
  v_balance bigint;
  v_expected_cost bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_knowbucks_cost not between 1 and 10000000000 then
    raise exception 'Woodcutting worker data is invalid.';
  end if;

  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1
  from public.discord_woodcutting_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  select coalesce(max(workers.worker_number), 0)::smallint + 1 into v_worker_number
  from public.discord_woodcutting_workers as workers
  where workers.guild_id = p_guild_id and workers.discord_user_id = p_discord_user_id;
  if v_worker_number > 10 then
    raise exception 'You already have the maximum of 10 lumberjacks.';
  end if;

  v_expected_cost := case v_worker_number
    when 1 then 500
    when 2 then 2500
    when 3 then 10000
    when 4 then 100000
    when 5 then 500000
    when 6 then 2500000
    when 7 then 15000000
    when 8 then 100000000
    when 9 then 1000000000
    when 10 then 10000000000
  end;
  if p_knowbucks_cost <> v_expected_cost then
    raise exception 'The lumberjack hire price changed. Please try again.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  if v_balance < v_expected_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  v_balance := v_balance - v_expected_cost;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -v_expected_cost, v_balance, 'woodcutting_worker_hire');

  insert into public.discord_woodcutting_workers (guild_id, discord_user_id, worker_number)
  values (p_guild_id, p_discord_user_id, v_worker_number);
  if v_worker_number = 1 then
    insert into public.discord_woodcutting_axes (guild_id, discord_user_id, axe_tier)
    values (p_guild_id, p_discord_user_id, 1)
    returning id into v_starter_axe_id;
  end if;

  return query select v_worker_number, v_starter_axe_id;
end;
$$;

create or replace function public.craft_discord_woodcutting_axe(
  p_guild_id text,
  p_discord_user_id text,
  p_axe_tier smallint,
  p_mining_cost jsonb,
  p_woodcutting_cost jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_item_id text;
  v_quantity integer;
  v_axe_id bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_axe_tier not between 1 and 7
    or jsonb_typeof(p_mining_cost) <> 'array'
    or jsonb_typeof(p_woodcutting_cost) <> 'array'
    or octet_length(p_mining_cost::text) > 8192
    or octet_length(p_woodcutting_cost::text) > 8192 then
    raise exception 'Woodcutting axe crafting data is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mining_cost || p_woodcutting_cost) as entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 1000000
  ) or exists (
    select 1 from jsonb_array_elements(p_mining_cost) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_woodcutting_cost) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) then
    raise exception 'Woodcutting axe recipe is invalid.';
  end if;

  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1
  from public.discord_woodcutting_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  for v_entry in select entries.value from jsonb_array_elements(p_mining_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1
    from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_item_id
      and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'You do not have the required mining materials.';
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_woodcutting_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1
    from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'You do not have the required Woodcutting materials.';
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_mining_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_item_id
      and inventory.quantity = v_quantity;
    if not found then
      update public.discord_game_resource_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.resource_id = v_item_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'Your mining materials changed before this axe could be crafted.';
      end if;
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_woodcutting_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    delete from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity = v_quantity;
    if not found then
      update public.discord_woodcutting_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.item_id = v_item_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'Your Woodcutting materials changed before this axe could be crafted.';
      end if;
    end if;
  end loop;

  insert into public.discord_woodcutting_axes (guild_id, discord_user_id, axe_tier)
  values (p_guild_id, p_discord_user_id, p_axe_tier)
  returning id into v_axe_id;
  return v_axe_id;
end;
$$;

create or replace function public.craft_discord_woodcutting_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_upgrade_id text,
  p_mining_cost jsonb,
  p_woodcutting_cost jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_item_id text;
  v_quantity integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_upgrade_id !~ '^[a-z][a-z0-9-]{0,63}$'
    or jsonb_typeof(p_mining_cost) <> 'array'
    or jsonb_typeof(p_woodcutting_cost) <> 'array'
    or octet_length(p_mining_cost::text) > 8192
    or octet_length(p_woodcutting_cost::text) > 8192 then
    raise exception 'Woodcutting upgrade crafting data is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mining_cost || p_woodcutting_cost) as entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 1000000
  ) or exists (
    select 1 from jsonb_array_elements(p_mining_cost) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_woodcutting_cost) as entries(value)
    group by entries.value ->> 'item_id'
    having count(*) > 1
  ) then
    raise exception 'Woodcutting upgrade recipe is invalid.';
  end if;

  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1
  from public.discord_woodcutting_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  if exists (
    select 1
    from public.discord_woodcutting_upgrades as upgrades
    where upgrades.guild_id = p_guild_id
      and upgrades.discord_user_id = p_discord_user_id
      and upgrades.upgrade_id = p_upgrade_id
  ) then
    raise exception 'You already own that Woodcutting upgrade.';
  end if;

  for v_entry in select entries.value from jsonb_array_elements(p_mining_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1
    from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_item_id
      and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'You do not have the required mining materials.';
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_woodcutting_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1
    from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity >= v_quantity
    for update;
    if not found then
      raise exception 'You do not have the required Woodcutting materials.';
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_mining_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_item_id
      and inventory.quantity = v_quantity;
    if not found then
      update public.discord_game_resource_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.resource_id = v_item_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'Your mining materials changed before this upgrade could be crafted.';
      end if;
    end if;
  end loop;

  for v_entry in select entries.value from jsonb_array_elements(p_woodcutting_cost) as entries(value)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    delete from public.discord_woodcutting_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_item_id
      and inventory.quantity = v_quantity;
    if not found then
      update public.discord_woodcutting_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.item_id = v_item_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'Your Woodcutting materials changed before this upgrade could be crafted.';
      end if;
    end if;
  end loop;

  insert into public.discord_woodcutting_upgrades (guild_id, discord_user_id, upgrade_id)
  values (p_guild_id, p_discord_user_id, p_upgrade_id);
end;
$$;

revoke all on function public.claim_discord_woodcutting_rewards(text, text, timestamptz, jsonb, jsonb, jsonb) from public;
revoke all on function public.hire_discord_woodcutting_worker(text, text, bigint) from public;
revoke all on function public.craft_discord_woodcutting_axe(text, text, smallint, jsonb, jsonb) from public;
revoke all on function public.craft_discord_woodcutting_upgrade(text, text, text, jsonb, jsonb) from public;
grant execute on function public.claim_discord_woodcutting_rewards(text, text, timestamptz, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.hire_discord_woodcutting_worker(text, text, bigint) to service_role;
grant execute on function public.craft_discord_woodcutting_axe(text, text, smallint, jsonb, jsonb) to service_role;
grant execute on function public.craft_discord_woodcutting_upgrade(text, text, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
