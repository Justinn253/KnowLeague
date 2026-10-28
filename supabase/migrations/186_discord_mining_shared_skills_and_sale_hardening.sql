begin;

-- Mining originally introduced separate skill upgrades. Preserve any ranks
-- already acquired by moving them into the established shared player tracks.
insert into public.discord_player_inventory (guild_id, discord_user_id, item_id, quantity)
select
  upgrades.guild_id,
  upgrades.discord_user_id,
  case
    when upgrades.upgrade_id like 'luck-%' then replace(upgrades.upgrade_id, 'luck-', 'lucky-')
    else upgrades.upgrade_id
  end,
  1
from public.discord_mining_player_upgrades as upgrades
where upgrades.upgrade_id in (
  'luck-1', 'luck-2', 'luck-3', 'luck-4',
  'cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4',
  'money-mouser-1', 'money-mouser-2',
  'haste-1', 'haste-2', 'haste-3', 'haste-4'
)
on conflict (guild_id, discord_user_id, item_id) do nothing;

delete from public.discord_mining_player_upgrades
where upgrade_id in (
  'luck-1', 'luck-2', 'luck-3', 'luck-4',
  'cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4',
  'money-mouser-1', 'money-mouser-2',
  'haste-1', 'haste-2', 'haste-3', 'haste-4'
);

-- Recreate the sale RPC with explicit table aliases and column precedence.
-- This keeps the inventory decrement, balance credit, and audit row atomic
-- while avoiding PL/pgSQL output-column ambiguity in deployed schemas.
create or replace function public.sell_discord_mining_resources(
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
#variable_conflict use_column
declare
  v_item jsonb;
  v_resource_id text;
  v_quantity integer;
  v_balance bigint;
  v_sold_count integer := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or jsonb_typeof(p_resources) <> 'array' or jsonb_array_length(p_resources) = 0
    or p_knowbucks_awarded not between 1 and 1000000000
    or octet_length(p_resources::text) > 8192 then
    raise exception 'Mining sale data is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_resources) as resources(value)
    where coalesce(resources.value ->> 'resource_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(resources.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (resources.value ->> 'quantity')::integer > 1000000000
  ) then
    raise exception 'Mining sale resources are invalid.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_resources) as resources(value)
    group by resources.value ->> 'resource_id'
    having count(*) > 1
  ) then
    raise exception 'Mining sale resources must not contain duplicates.';
  end if;

  perform public.ensure_discord_mining_player(p_guild_id, p_discord_user_id);
  perform 1
  from public.discord_mining_players as players
  where players.guild_id = p_guild_id
    and players.discord_user_id = p_discord_user_id
  for update;

  for v_item in select resources.value from jsonb_array_elements(p_resources) as resources(value)
  loop
    v_resource_id := v_item ->> 'resource_id';
    v_quantity := (v_item ->> 'quantity')::integer;
    perform 1
    from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_resource_id
      and inventory.quantity >= v_quantity
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
    set quantity = inventory.quantity - v_quantity,
        updated_at = now()
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_resource_id;
    delete from public.discord_game_resource_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.resource_id = v_resource_id
      and inventory.quantity = 0;
  end loop;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id
  for update;
  v_balance := v_balance + p_knowbucks_awarded;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, p_knowbucks_awarded, v_balance, 'mining_sale');

  return query select v_balance, v_sold_count;
end;
$$;

revoke all on function public.sell_discord_mining_resources(text, text, jsonb, bigint) from public;
grant execute on function public.sell_discord_mining_resources(text, text, jsonb, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
