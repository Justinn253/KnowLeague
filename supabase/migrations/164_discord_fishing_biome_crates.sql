begin;

-- Crate openings have their own auditable KnowBucks source while preserving
-- the original source for any historical rows created by the retired RPC.
alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add',
    'collection_sell', 'collection_steal', 'fishing_expedition',
    'fishing_shop_purchase', 'fishing_chest_open', 'fishing_crate_open'
  ));

-- The old chest item IDs only recorded rarity, not source biome. Preserve the
-- items by converting them to the starter biome's equivalent crate rather
-- than deleting or silently consuming player inventory.
insert into public.discord_fishing_inventory as inventory (
  guild_id, discord_user_id, item_id, quantity, acquired_at, updated_at
)
select
  legacy.guild_id,
  legacy.discord_user_id,
  case legacy.item_id
    when 'common-chest' then 'harbor-common-crate'
    when 'uncommon-chest' then 'harbor-uncommon-crate'
    when 'rare-chest' then 'harbor-rare-crate'
    when 'epic-chest' then 'harbor-epic-crate'
    when 'legendary-chest' then 'harbor-legendary-crate'
    when 'weathered-chest' then 'harbor-common-crate'
    when 'deep-sea-chest' then 'sunken-sea-rare-crate'
  end,
  sum(legacy.quantity)::integer,
  min(legacy.acquired_at),
  now()
from public.discord_fishing_inventory as legacy
where legacy.item_id in ('common-chest', 'uncommon-chest', 'rare-chest', 'epic-chest', 'legendary-chest', 'weathered-chest', 'deep-sea-chest')
group by legacy.guild_id, legacy.discord_user_id, case legacy.item_id
  when 'common-chest' then 'harbor-common-crate'
  when 'uncommon-chest' then 'harbor-uncommon-crate'
  when 'rare-chest' then 'harbor-rare-crate'
  when 'epic-chest' then 'harbor-epic-crate'
  when 'legendary-chest' then 'harbor-legendary-crate'
  when 'weathered-chest' then 'harbor-common-crate'
  when 'deep-sea-chest' then 'sunken-sea-rare-crate'
end
on conflict on constraint discord_fishing_inventory_pkey do update
set quantity = inventory.quantity + excluded.quantity,
    updated_at = now();

delete from public.discord_fishing_inventory
where item_id in ('common-chest', 'uncommon-chest', 'rare-chest', 'epic-chest', 'legendary-chest', 'weathered-chest', 'deep-sea-chest');

create function public.open_discord_fishing_crates(
  p_guild_id text,
  p_discord_user_id text,
  p_crate_item_id text,
  p_crate_quantity integer,
  p_knowbucks_awarded bigint
)
returns table (opened_count integer, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crate_quantity integer;
  v_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_crate_item_id !~ '^(harbor|warm-ocean|hydroplant-reservoir|sunken-sea|kelp-forest|crystaline-caverns|rallypoint-delta)-(common|uncommon|rare|epic|legendary)-crate$'
    or p_crate_quantity not between 1 and 10
    or p_knowbucks_awarded not between 1 and 1000000000 then
    raise exception 'Fishing crate opening data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);

  -- Keep the player lock first, matching expedition settlement and launch
  -- ordering so opening a crate cannot deadlock with a fishing reward.
  perform 1
  from public.discord_fishing_players as players
  where players.guild_id = p_guild_id
    and players.discord_user_id = p_discord_user_id
  for update;

  select inventory.quantity into v_crate_quantity
  from public.discord_fishing_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.item_id = p_crate_item_id
  for update;
  if not found or v_crate_quantity < p_crate_quantity then
    raise exception 'You do not have enough of that crate.';
  end if;

  if v_crate_quantity = p_crate_quantity then
    delete from public.discord_fishing_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = p_crate_item_id;
  else
    update public.discord_fishing_inventory as inventory
    set quantity = inventory.quantity - p_crate_quantity,
        updated_at = now()
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = p_crate_item_id;
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict on constraint discord_knowbucks_balances_pkey do nothing;

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

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source
  ) values (
    p_guild_id, p_discord_user_id, p_knowbucks_awarded, v_balance, 'fishing_crate_open'
  );

  return query select p_crate_quantity, v_balance;
end;
$$;

revoke all on function public.open_discord_fishing_crates(text, text, text, integer, bigint) from public;
grant execute on function public.open_discord_fishing_crates(text, text, text, integer, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
