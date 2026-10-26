begin;

-- Player inventory is deliberately separate from game-specific storage. The
-- existing Fishing skill tiers become reusable player upgrades without losing
-- ownership or their established KnowBucks prices.
create table if not exists public.discord_player_inventory (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  item_id text not null check (item_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  quantity integer not null default 1 check (quantity between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, item_id)
);

create index if not exists discord_player_inventory_guild_item_idx
  on public.discord_player_inventory (guild_id, item_id, discord_user_id);

alter table public.discord_player_inventory enable row level security;
revoke all on table public.discord_player_inventory from anon, authenticated;
grant select, insert, update, delete on table public.discord_player_inventory to service_role;

-- Move each previously purchased skill once. Fishing equipment and settlement
-- snapshots retain the same item IDs, so active and future expeditions keep
-- their existing modifiers after the bot starts reading player inventory.
insert into public.discord_player_inventory (guild_id, discord_user_id, item_id, quantity)
select guild_id, discord_user_id, item_id, quantity
from public.discord_fishing_inventory
where item_id in (
  'lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5',
  'cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4',
  'money-mouser-1', 'money-mouser-2',
  'haste-1', 'haste-2', 'haste-3', 'haste-4'
)
on conflict (guild_id, discord_user_id, item_id) do update
set quantity = greatest(public.discord_player_inventory.quantity, excluded.quantity),
    updated_at = now();

delete from public.discord_fishing_inventory
where item_id in (
  'lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5',
  'cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4',
  'money-mouser-1', 'money-mouser-2',
  'haste-1', 'haste-2', 'haste-3', 'haste-4'
);

create or replace function public.get_discord_player_skill_levels(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  lucky_level integer,
  cheapskate_level integer,
  money_mouser_level integer,
  haste_level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    least(5, count(*) filter (where inventory.item_id in ('lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5')))::integer,
    least(4, count(*) filter (where inventory.item_id in ('cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4')))::integer,
    least(2, count(*) filter (where inventory.item_id in ('money-mouser-1', 'money-mouser-2')))::integer,
    least(4, count(*) filter (where inventory.item_id in ('haste-1', 'haste-2', 'haste-3', 'haste-4')))::integer
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id;
$$;

-- Keep the older collections helper as a compatible API while it sources the
-- new shared player inventory.
create or replace function public.get_discord_collection_fishing_skill_levels(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  lucky_level integer,
  cheapskate_level integer,
  money_mouser_level integer,
  haste_level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.get_discord_player_skill_levels(p_guild_id, p_discord_user_id);
$$;

create or replace function public.purchase_discord_player_shop_item(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text
)
returns table (
  current_balance bigint,
  charged_cost bigint,
  item_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_cost bigint;
  v_charged_cost bigint;
  v_balance bigint;
  v_cheapskate_level integer := 0;
  v_fishing_cost_reduction integer := 0;
  v_required_item_id text;
  v_is_skill boolean := false;
  v_is_replenishable boolean := false;
  v_current_quantity integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_item_id !~ '^[a-z][a-z0-9-]{0,63}$' then
    raise exception 'Player shop inputs are invalid.';
  end if;

  case p_item_id
    when 'lucky-1' then v_base_cost := 2500; v_is_skill := true;
    when 'lucky-2' then v_base_cost := 15000; v_is_skill := true; v_required_item_id := 'lucky-1';
    when 'lucky-3' then v_base_cost := 50000; v_is_skill := true; v_required_item_id := 'lucky-2';
    when 'lucky-4' then v_base_cost := 250000; v_is_skill := true; v_required_item_id := 'lucky-3';
    when 'lucky-5' then v_base_cost := 1000000; v_is_skill := true; v_required_item_id := 'lucky-4';
    when 'cheapskate-1' then v_base_cost := 10000; v_is_skill := true;
    when 'cheapskate-2' then v_base_cost := 50000; v_is_skill := true; v_required_item_id := 'cheapskate-1';
    when 'cheapskate-3' then v_base_cost := 250000; v_is_skill := true; v_required_item_id := 'cheapskate-2';
    when 'cheapskate-4' then v_base_cost := 1000000; v_is_skill := true; v_required_item_id := 'cheapskate-3';
    when 'money-mouser-1' then v_base_cost := 250000; v_is_skill := true;
    when 'money-mouser-2' then v_base_cost := 1000000; v_is_skill := true; v_required_item_id := 'money-mouser-1';
    when 'haste-1' then v_base_cost := 10000; v_is_skill := true;
    when 'haste-2' then v_base_cost := 25000; v_is_skill := true; v_required_item_id := 'haste-1';
    when 'haste-3' then v_base_cost := 100000; v_is_skill := true; v_required_item_id := 'haste-2';
    when 'haste-4' then v_base_cost := 250000; v_is_skill := true; v_required_item_id := 'haste-3';
    when 'mask' then v_base_cost := 100000;
    when 'knife' then v_base_cost := 250000;
    when 'gun' then v_base_cost := 1000000;
    when 'safe' then v_base_cost := 250000;
    when 'bodyguard' then v_base_cost := 1000000; v_is_replenishable := true;
    else raise exception 'That player-shop item is unavailable.';
  end case;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;

  select inventory.quantity into v_current_quantity
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.item_id = p_item_id
  for update;
  if v_current_quantity is not null and not v_is_replenishable then
    raise exception 'You already own that player-shop item.';
  end if;

  if v_required_item_id is not null and not exists (
    select 1
    from public.discord_player_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = v_required_item_id
  ) then
    raise exception 'This skill requires the previous tier first.';
  end if;

  if v_is_skill then
    select count(*)::integer into v_cheapskate_level
    from public.discord_player_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id in ('cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4');
    select count(*)::integer into v_fishing_cost_reduction
    from public.discord_fishing_inventory as inventory
    where inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = 'gear-lost-pursasion-device';
    v_charged_cost := ceil(v_base_cost::numeric * greatest(0::numeric, 1 - ((v_cheapskate_level * 5 + v_fishing_cost_reduction * 5)::numeric / 100)))::bigint;
  else
    v_charged_cost := v_base_cost;
  end if;

  if v_balance < v_charged_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  v_balance := v_balance - v_charged_cost;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -v_charged_cost, v_balance, 'player_shop_purchase');

  if v_is_replenishable then
    insert into public.discord_player_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
    values (p_guild_id, p_discord_user_id, p_item_id, 10)
    on conflict (guild_id, discord_user_id, item_id) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now()
    returning quantity into v_current_quantity;
  else
    insert into public.discord_player_inventory (guild_id, discord_user_id, item_id, quantity)
    values (p_guild_id, p_discord_user_id, p_item_id, 1)
    returning quantity into v_current_quantity;
  end if;

  return query select v_balance, v_charged_cost, v_current_quantity;
end;
$$;

create table if not exists public.discord_player_rob_cooldowns (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  available_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

alter table public.discord_player_rob_cooldowns enable row level security;
revoke all on table public.discord_player_rob_cooldowns from anon, authenticated;
grant select, insert, update, delete on table public.discord_player_rob_cooldowns to service_role;

-- The complete robbery operation is one transaction. It locks both balances in
-- a stable order, consumes a Bodyguard charge at most once, and records every
-- actual transfer in the auditable KnowBucks ledger.
create or replace function public.rob_discord_player(
  p_guild_id text,
  p_robber_discord_user_id text,
  p_target_discord_user_id text
)
returns table (
  outcome text,
  cooldown_available_at timestamptz,
  robbery_chance_percent integer,
  theft_percent integer,
  stolen_amount bigint,
  failure_penalty bigint,
  robber_balance bigint,
  target_balance bigint,
  masked boolean,
  revealed boolean,
  bodyguard_used boolean,
  bodyguard_charges integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available_at timestamptz;
  v_robber_balance bigint;
  v_target_balance bigint;
  v_robber_lucky integer := 0;
  v_target_lucky integer := 0;
  v_robber_has_mask boolean := false;
  v_robber_has_knife boolean := false;
  v_robber_has_gun boolean := false;
  v_robber_has_safe boolean := false;
  v_target_has_knife boolean := false;
  v_target_has_gun boolean := false;
  v_target_has_safe boolean := false;
  v_target_bodyguard_charges integer := 0;
  v_haste_level integer := 0;
  v_success_chance integer;
  v_success boolean;
  v_theft_percent integer := 0;
  v_stolen_amount bigint := 0;
  v_failure_penalty bigint := 0;
  v_protected_amount bigint := 0;
  v_cooldown_seconds integer;
  v_bodyguard_used boolean := false;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_robber_discord_user_id !~ '^[0-9]{17,20}$'
    or p_target_discord_user_id !~ '^[0-9]{17,20}$'
    or p_robber_discord_user_id = p_target_discord_user_id then
    raise exception 'Robbery inputs are invalid.';
  end if;

  insert into public.discord_player_rob_cooldowns (guild_id, discord_user_id, available_at)
  values (p_guild_id, p_robber_discord_user_id, to_timestamp(0))
  on conflict (guild_id, discord_user_id) do nothing;
  select cooldowns.available_at into v_available_at
  from public.discord_player_rob_cooldowns as cooldowns
  where cooldowns.guild_id = p_guild_id and cooldowns.discord_user_id = p_robber_discord_user_id
  for update;
  if v_available_at > now() then
    return query select 'cooldown'::text, v_available_at, 0, 0, 0::bigint, 0::bigint, 0::bigint, 0::bigint, false, false, false, 0;
    return;
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values
    (p_guild_id, p_robber_discord_user_id),
    (p_guild_id, p_target_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  perform 1
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id in (p_robber_discord_user_id, p_target_discord_user_id)
  order by balances.discord_user_id
  for update;
  select balance into v_robber_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_robber_discord_user_id;
  select balance into v_target_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_target_discord_user_id;

  if v_target_balance = 0 then
    return query select 'target-empty'::text, null::timestamptz, 0, 0, 0::bigint, 0::bigint, v_robber_balance, v_target_balance, false, false, false, 0;
    return;
  end if;

  perform 1
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id in (p_robber_discord_user_id, p_target_discord_user_id)
  order by inventory.discord_user_id, inventory.item_id
  for update;

  select
    count(*) filter (where inventory.item_id in ('lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5'))::integer,
    count(*) filter (where inventory.item_id in ('haste-1', 'haste-2', 'haste-3', 'haste-4'))::integer,
    bool_or(inventory.item_id = 'mask'),
    bool_or(inventory.item_id = 'knife'),
    bool_or(inventory.item_id = 'gun'),
    bool_or(inventory.item_id = 'safe')
  into v_robber_lucky, v_haste_level, v_robber_has_mask, v_robber_has_knife, v_robber_has_gun, v_robber_has_safe
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_robber_discord_user_id;
  select
    count(*) filter (where inventory.item_id in ('lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5'))::integer,
    bool_or(inventory.item_id = 'knife'),
    bool_or(inventory.item_id = 'gun'),
    bool_or(inventory.item_id = 'safe'),
    coalesce(max(inventory.quantity) filter (where inventory.item_id = 'bodyguard'), 0)::integer
  into v_target_lucky, v_target_has_knife, v_target_has_gun, v_target_has_safe, v_target_bodyguard_charges
  from public.discord_player_inventory as inventory
  where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_target_discord_user_id;
  v_robber_lucky := coalesce(v_robber_lucky, 0);
  v_haste_level := coalesce(v_haste_level, 0);
  v_target_lucky := coalesce(v_target_lucky, 0);
  v_robber_has_mask := coalesce(v_robber_has_mask, false);
  v_robber_has_knife := coalesce(v_robber_has_knife, false);
  v_robber_has_gun := coalesce(v_robber_has_gun, false);
  v_robber_has_safe := coalesce(v_robber_has_safe, false);
  v_target_has_knife := coalesce(v_target_has_knife, false);
  v_target_has_gun := coalesce(v_target_has_gun, false);
  v_target_has_safe := coalesce(v_target_has_safe, false);

  v_success_chance := greatest(1, least(100,
    5 + (v_robber_lucky * 2)
      + case when v_robber_has_knife then 3 else 0 end
      + case when v_robber_has_gun then 5 else 0 end
      - v_target_lucky
      - case when v_target_has_knife then 1 else 0 end
      - case when v_target_has_gun then 2 else 0 end
      - case when v_target_bodyguard_charges > 0 then 5 else 0 end
  ));
  v_success := random() * 100 < v_success_chance;
  v_cooldown_seconds := round(3600 * greatest(0::numeric, 1 - (least(4, v_haste_level)::numeric * 0.05)))::integer;
  v_available_at := now() + make_interval(secs => v_cooldown_seconds);
  update public.discord_player_rob_cooldowns
  set available_at = v_available_at, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_robber_discord_user_id;

  if v_target_bodyguard_charges > 0 then
    v_bodyguard_used := true;
    if v_target_bodyguard_charges = 1 then
      delete from public.discord_player_inventory
      where guild_id = p_guild_id
        and discord_user_id = p_target_discord_user_id
        and item_id = 'bodyguard';
    else
      update public.discord_player_inventory
      set quantity = quantity - 1, updated_at = now()
      where guild_id = p_guild_id
        and discord_user_id = p_target_discord_user_id
        and item_id = 'bodyguard';
    end if;
    v_target_bodyguard_charges := v_target_bodyguard_charges - 1;
  end if;

  if v_success then
    v_theft_percent := case
      when floor(random() * 121)::integer < 100 then 5
      when floor(random() * 121)::integer < 120 then 20
      else 75
    end;
    if v_target_has_safe then
      v_protected_amount := ceil(v_target_balance::numeric * 0.25)::bigint;
    end if;
    v_stolen_amount := least(
      greatest(1::bigint, floor(v_target_balance::numeric * v_theft_percent / 100)::bigint),
      greatest(0::bigint, v_target_balance - v_protected_amount)
    );
    if v_stolen_amount > 0 then
      v_robber_balance := v_robber_balance + v_stolen_amount;
      v_target_balance := v_target_balance - v_stolen_amount;
      update public.discord_knowbucks_balances
      set balance = case
        when discord_user_id = p_robber_discord_user_id then v_robber_balance
        else v_target_balance
      end,
      updated_at = now()
      where guild_id = p_guild_id
        and discord_user_id in (p_robber_discord_user_id, p_target_discord_user_id);
      insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source, related_discord_user_id)
      values
        (p_guild_id, p_robber_discord_user_id, v_stolen_amount, v_robber_balance, 'robbery_success', p_target_discord_user_id),
        (p_guild_id, p_target_discord_user_id, -v_stolen_amount, v_target_balance, 'robbery_loss', p_robber_discord_user_id);
    end if;
    return query select 'success'::text, v_available_at, v_success_chance, v_theft_percent, v_stolen_amount, 0::bigint, v_robber_balance, v_target_balance, v_robber_has_mask, false, v_bodyguard_used, v_target_bodyguard_charges;
    return;
  end if;

  -- A defending Bodyguard explicitly collects half on a failed attempt and
  -- exposes the robber, even if the robber owns a Safe. Without a Bodyguard,
  -- the robber's Safe reduces the ordinary failure loss to 25%.
  v_failure_penalty := floor(v_robber_balance::numeric * case
    when v_bodyguard_used then 0.5
    when v_robber_has_safe then 0.25
    else 0.5
  end)::bigint;
  if v_failure_penalty > 0 then
    v_robber_balance := v_robber_balance - v_failure_penalty;
    v_target_balance := v_target_balance + v_failure_penalty;
    update public.discord_knowbucks_balances
    set balance = case
      when discord_user_id = p_robber_discord_user_id then v_robber_balance
      else v_target_balance
    end,
    updated_at = now()
    where guild_id = p_guild_id
      and discord_user_id in (p_robber_discord_user_id, p_target_discord_user_id);
    insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source, related_discord_user_id)
    values
      (p_guild_id, p_robber_discord_user_id, -v_failure_penalty, v_robber_balance, 'robbery_failure', p_target_discord_user_id),
      (p_guild_id, p_target_discord_user_id, v_failure_penalty, v_target_balance, 'robbery_defense', p_robber_discord_user_id);
  end if;
  return query select 'failed'::text, v_available_at, v_success_chance, 0, 0::bigint, v_failure_penalty, v_robber_balance, v_target_balance, v_robber_has_mask and not v_bodyguard_used, v_bodyguard_used, v_bodyguard_used, v_target_bodyguard_charges;
end;
$$;

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
    'robbery_success', 'robbery_loss', 'robbery_failure', 'robbery_defense'
  ));

revoke all on function public.get_discord_player_skill_levels(text, text) from public;
revoke all on function public.get_discord_collection_fishing_skill_levels(text, text) from public;
revoke all on function public.purchase_discord_player_shop_item(text, text, text) from public;
revoke all on function public.rob_discord_player(text, text, text) from public;
grant execute on function public.get_discord_player_skill_levels(text, text) to service_role;
grant execute on function public.get_discord_collection_fishing_skill_levels(text, text) to service_role;
grant execute on function public.purchase_discord_player_shop_item(text, text, text) to service_role;
grant execute on function public.rob_discord_player(text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
