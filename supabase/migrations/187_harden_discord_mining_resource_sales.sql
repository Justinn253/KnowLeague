begin;

-- Keep the sale catalogue in the database as well as the shared game
-- catalogue. The sale RPC therefore calculates payouts itself instead of
-- trusting a caller-supplied KnowBucks amount.
create table public.discord_mining_resource_catalog (
  resource_id text primary key check (resource_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  resource_kind text not null check (resource_kind in ('ore', 'gem')),
  processor_tier smallint not null default 0 check (processor_tier between 0 and 6),
  sale_value integer not null check (sale_value between 1 and 1000000),
  updated_at timestamptz not null default now()
);

alter table public.discord_mining_resource_catalog enable row level security;
revoke all on table public.discord_mining_resource_catalog from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_resource_catalog to service_role;

insert into public.discord_mining_resource_catalog (resource_id, resource_kind, processor_tier, sale_value)
values
  ('coal', 'ore', 0, 7), ('quartz', 'ore', 0, 11), ('opal', 'gem', 0, 20), ('pearl', 'gem', 0, 40),
  ('copper', 'ore', 1, 10), ('tin', 'ore', 1, 17), ('jade', 'gem', 0, 31), ('emerald', 'gem', 0, 75),
  ('iron', 'ore', 2, 18), ('lead', 'ore', 2, 30), ('ruby', 'gem', 0, 55), ('garnet', 'gem', 0, 123),
  ('silver', 'ore', 3, 38), ('tungsten', 'ore', 3, 65), ('topaz', 'gem', 0, 115), ('sapphire', 'gem', 0, 260),
  ('gold', 'ore', 4, 60), ('platinum', 'ore', 4, 98), ('amethyst', 'gem', 0, 170), ('aquamarine', 'gem', 0, 395),
  ('cobalt', 'ore', 5, 90), ('palladium', 'ore', 5, 148), ('citrine', 'gem', 0, 270), ('peridot', 'gem', 0, 650),
  ('titanium', 'ore', 6, 142), ('adamantite', 'ore', 6, 242), ('diamond', 'gem', 0, 440), ('moissanite', 'gem', 0, 1025)
on conflict (resource_id) do update
set resource_kind = excluded.resource_kind,
    processor_tier = excluded.processor_tier,
    sale_value = excluded.sale_value,
    updated_at = now();

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

  update public.discord_game_resource_inventory as inventory
  set quantity = inventory.quantity - p_quantity,
      updated_at = now()
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.resource_id = p_resource_id;
  delete from public.discord_game_resource_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.resource_id = p_resource_id
    and inventory.quantity = 0;

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

revoke all on function public.sell_discord_mining_resource(text, text, text, integer) from public;
grant execute on function public.sell_discord_mining_resource(text, text, text, integer) to service_role;

-- The original bulk-sale procedure accepted a caller-calculated payout. The
-- bot and website now exclusively use the catalogue-backed procedure above,
-- so prevent it from being used by a future server call accidentally.
revoke all on function public.sell_discord_mining_resources(text, text, jsonb, bigint) from service_role;

notify pgrst, 'reload schema';

commit;
