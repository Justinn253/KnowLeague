begin;

-- Resource inventory deliberately disallows zero-quantity rows. The original
-- Mining routines decremented an exact-cost row to zero before deleting it,
-- which caused PostgreSQL to reject the intermediate value. Delete exact
-- matches first and only decrement rows that remain positive.
create or replace function public.purchase_discord_mining_upgrade(
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
  ) or exists (
    select 1
    from jsonb_array_elements(p_resource_cost) as costs(value)
    group by costs.value ->> 'resource_id'
    having count(*) > 1
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

    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_resource_id
      and inventory.quantity = v_quantity;

    if not found then
      update public.discord_game_resource_inventory as inventory
      set quantity = inventory.quantity - v_quantity,
          updated_at = now()
      where inventory.guild_id = p_guild_id
        and inventory.discord_user_id = p_discord_user_id
        and inventory.resource_id = v_resource_id
        and inventory.quantity > v_quantity;
      if not found then
        raise exception 'Your mining materials changed before this upgrade could be crafted.';
      end if;
    end if;
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

create or replace function public.sell_discord_mining_resource(
  p_guild_id text,
  p_discord_user_id text,
  p_resource_id text,
  p_quantity integer
)
returns table (current_balance bigint, sold_count integer, knowbucks_awarded bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_resource public.discord_mining_resource_catalog%rowtype;
  v_balance bigint;
  v_money_mouser_level integer := 0;
  v_awarded bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_resource_id !~ '^[a-z][a-z0-9-]{0,63}$' or p_quantity not between 1 and 1000000000 then
    raise exception 'Mining sale data is invalid.';
  end if;

  perform public.ensure_discord_mining_player(p_guild_id, p_discord_user_id);
  perform 1
  from public.discord_mining_players as players
  where players.guild_id = p_guild_id
    and players.discord_user_id = p_discord_user_id
  for update;

  select * into v_resource
  from public.discord_mining_resource_catalog as catalog
  where catalog.resource_id = p_resource_id
  for share;
  if not found then
    raise exception 'That mining resource cannot be sold.';
  end if;

  if v_resource.resource_kind = 'ore' and v_resource.processor_tier > 0 and not exists (
    select 1
    from public.discord_game_material_processors as processors
    where processors.guild_id = p_guild_id
      and processors.discord_user_id = p_discord_user_id
      and processors.processor_tier >= v_resource.processor_tier
  ) then
    raise exception 'This ore requires its matching processor before it can be sold.';
  end if;

  perform 1
  from public.discord_game_resource_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.resource_id = p_resource_id
    and inventory.quantity >= p_quantity
  for update;
  if not found then
    raise exception 'You do not have that quantity of this mining resource.';
  end if;

  select least(2, count(*))::integer into v_money_mouser_level
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.item_id in ('money-mouser-1', 'money-mouser-2');
  v_awarded := greatest(1, round(v_resource.sale_value::numeric * p_quantity * (1 + (v_money_mouser_level * 0.05)))::bigint);

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id
  for update;

  delete from public.discord_game_resource_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.resource_id = p_resource_id
    and inventory.quantity = p_quantity;

  if not found then
    update public.discord_game_resource_inventory as inventory
    set quantity = inventory.quantity - p_quantity,
        updated_at = now()
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = p_resource_id
      and inventory.quantity > p_quantity;
    if not found then
      raise exception 'That mining resource changed before it could be sold.';
    end if;
  end if;

  v_balance := v_balance + v_awarded;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, v_awarded, v_balance, 'mining_sale');

  return query select v_balance, p_quantity, v_awarded;
end;
$$;

revoke all on function public.purchase_discord_mining_upgrade(text, text, text, jsonb, bigint, smallint) from public;
grant execute on function public.purchase_discord_mining_upgrade(text, text, text, jsonb, bigint, smallint) to service_role;
revoke all on function public.sell_discord_mining_resource(text, text, text, integer) from public;
grant execute on function public.sell_discord_mining_resource(text, text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
