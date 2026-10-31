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
    'mining_sale', 'mining_shop_purchase', 'woodcutting_sapling_purchase',
    'woodcutting_worker_hire'
  ));

create table public.discord_woodcutting_players (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  last_claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

create table public.discord_woodcutting_axes (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  axe_tier smallint not null check (axe_tier between 1 and 7),
  acquired_at timestamptz not null default now(),
  foreign key (guild_id, discord_user_id)
    references public.discord_woodcutting_players(guild_id, discord_user_id) on delete cascade
);

create index discord_woodcutting_axes_owner_tier_idx
  on public.discord_woodcutting_axes (guild_id, discord_user_id, axe_tier, id);

create table public.discord_woodcutting_workers (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  worker_number smallint not null check (worker_number between 1 and 10),
  axe_id bigint unique references public.discord_woodcutting_axes(id) on delete set null,
  sapling_tier smallint check (sapling_tier between 1 and 7),
  chop_remainder_ms integer not null default 0 check (chop_remainder_ms between 0 and 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, worker_number),
  foreign key (guild_id, discord_user_id)
    references public.discord_woodcutting_players(guild_id, discord_user_id) on delete cascade,
  check ((axe_id is null and sapling_tier is null) or (axe_id is not null and sapling_tier is not null))
);

create table public.discord_woodcutting_inventory (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  item_id text not null check (item_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  quantity integer not null check (quantity between 1 and 1000000000),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, item_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_woodcutting_players(guild_id, discord_user_id) on delete cascade
);

create table public.discord_woodcutting_upgrades (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  upgrade_id text not null check (upgrade_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  acquired_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, upgrade_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_woodcutting_players(guild_id, discord_user_id) on delete cascade
);

create table public.discord_woodcutting_catalogue_discoveries (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  item_id text not null check (item_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  discovered_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, item_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_woodcutting_players(guild_id, discord_user_id) on delete cascade
);

alter table public.discord_woodcutting_players enable row level security;
alter table public.discord_woodcutting_axes enable row level security;
alter table public.discord_woodcutting_workers enable row level security;
alter table public.discord_woodcutting_inventory enable row level security;
alter table public.discord_woodcutting_upgrades enable row level security;
alter table public.discord_woodcutting_catalogue_discoveries enable row level security;
revoke all on table public.discord_woodcutting_players from anon, authenticated;
revoke all on table public.discord_woodcutting_axes from anon, authenticated;
revoke all on table public.discord_woodcutting_workers from anon, authenticated;
revoke all on table public.discord_woodcutting_inventory from anon, authenticated;
revoke all on table public.discord_woodcutting_upgrades from anon, authenticated;
revoke all on table public.discord_woodcutting_catalogue_discoveries from anon, authenticated;
grant select, insert, update, delete on table public.discord_woodcutting_players to service_role;
grant select, insert, update, delete on table public.discord_woodcutting_axes to service_role;
grant select, insert, update, delete on table public.discord_woodcutting_workers to service_role;
grant select, insert, update, delete on table public.discord_woodcutting_inventory to service_role;
grant select, insert, update, delete on table public.discord_woodcutting_upgrades to service_role;
grant select, insert, update, delete on table public.discord_woodcutting_catalogue_discoveries to service_role;

create function public.ensure_discord_woodcutting_player(
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
  insert into public.discord_woodcutting_players (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
end;
$$;

create function public.claim_discord_woodcutting_rewards(
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
    or jsonb_typeof(p_sapling_consumption) <> 'array'
    or jsonb_typeof(p_item_rewards) <> 'array'
    or jsonb_typeof(p_worker_remainders) <> 'array'
    or octet_length(p_sapling_consumption::text) > 8192
    or octet_length(p_item_rewards::text) > 8192
    or octet_length(p_worker_remainders::text) > 4096 then
    raise exception 'Woodcutting claim data is invalid.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sapling_consumption || p_item_rewards) as entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 100000000
  ) or exists (
    select 1 from jsonb_array_elements(p_worker_remainders) as entries(value)
    where coalesce(entries.value ->> 'worker_number' ~ '^(10|[1-9])$', false) = false
      or coalesce(entries.value ->> 'chop_remainder_ms' ~ '^[0-9]+$', false) = false
      or (entries.value ->> 'chop_remainder_ms')::integer > 60000
  ) then
    raise exception 'Woodcutting claim rewards are invalid.';
  end if;

  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  select last_claimed_at into v_last_claimed_at
  from public.discord_woodcutting_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_last_claimed_at <> p_expected_last_claimed_at then
    raise exception 'Your Woodcutting progress changed before this claim could be saved. Please claim again.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_sapling_consumption)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1 from public.discord_woodcutting_inventory
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id
      and item_id = v_item_id and quantity >= v_quantity
    for update;
    if not found then raise exception 'A selected sapling stack changed before your Woodcutting claim could be saved.'; end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_sapling_consumption)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    update public.discord_woodcutting_inventory
    set quantity = quantity - v_quantity, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_item_id;
    delete from public.discord_woodcutting_inventory
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_item_id and quantity = 0;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_item_rewards)
  loop
    v_item_id := v_entry ->> 'item_id';
    v_quantity := (v_entry ->> 'quantity')::integer;
    insert into public.discord_woodcutting_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
    values (p_guild_id, p_discord_user_id, v_item_id, v_quantity)
    on conflict (guild_id, discord_user_id, item_id) do update
    set quantity = inventory.quantity + excluded.quantity, updated_at = now();
    insert into public.discord_woodcutting_catalogue_discoveries (guild_id, discord_user_id, item_id)
    values (p_guild_id, p_discord_user_id, v_item_id)
    on conflict (guild_id, discord_user_id, item_id) do nothing;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_worker_remainders)
  loop
    v_worker_number := (v_entry ->> 'worker_number')::smallint;
    v_remainder := (v_entry ->> 'chop_remainder_ms')::integer;
    update public.discord_woodcutting_workers
    set chop_remainder_ms = v_remainder, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and worker_number = v_worker_number;
  end loop;

  update public.discord_woodcutting_players
  set last_claimed_at = now(), updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  returning last_claimed_at into v_last_claimed_at;
  return v_last_claimed_at;
end;
$$;

create function public.hire_discord_woodcutting_worker(
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
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_knowbucks_cost not between 1 and 10000000000 then
    raise exception 'Woodcutting worker data is invalid.';
  end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  select coalesce(max(worker_number), 0)::smallint + 1 into v_worker_number
  from public.discord_woodcutting_workers
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  if v_worker_number > 10 then raise exception 'You already have the maximum of 10 lumberjacks.'; end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id) on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  if v_balance < p_knowbucks_cost then raise exception 'Insufficient KnowBucks balance.'; end if;
  v_balance := v_balance - p_knowbucks_cost;
  update public.discord_knowbucks_balances set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_knowbucks_cost, v_balance, 'woodcutting_worker_hire');

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

create function public.purchase_discord_woodcutting_saplings(
  p_guild_id text,
  p_discord_user_id text,
  p_sapling_item_id text,
  p_quantity integer,
  p_knowbucks_cost bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_balance bigint; v_existing integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_sapling_item_id !~ '^[a-z][a-z0-9-]{0,63}$'
    or p_quantity not between 1 and 1000000 or p_knowbucks_cost not between 1 and 1000000000000 then
    raise exception 'Woodcutting sapling purchase data is invalid.';
  end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  select quantity into v_existing from public.discord_woodcutting_inventory
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_sapling_item_id for update;
  if coalesce(v_existing, 0) + p_quantity > 1000000 then raise exception 'Each sapling type is limited to 1,000,000 stored saplings.'; end if;
  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id) on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance from public.discord_knowbucks_balances where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  if v_balance < p_knowbucks_cost then raise exception 'Insufficient KnowBucks balance.'; end if;
  v_balance := v_balance - p_knowbucks_cost;
  update public.discord_knowbucks_balances set balance = v_balance, updated_at = now() where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_knowbucks_cost, v_balance, 'woodcutting_sapling_purchase');
  insert into public.discord_woodcutting_inventory as inventory (guild_id, discord_user_id, item_id, quantity)
  values (p_guild_id, p_discord_user_id, p_sapling_item_id, p_quantity)
  on conflict (guild_id, discord_user_id, item_id) do update set quantity = inventory.quantity + excluded.quantity, updated_at = now();
  return v_balance;
end;
$$;

create function public.craft_discord_woodcutting_axe(
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
declare v_entry jsonb; v_item_id text; v_quantity integer; v_axe_id bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_axe_tier not between 1 and 7
    or jsonb_typeof(p_mining_cost) <> 'array' or jsonb_typeof(p_woodcutting_cost) <> 'array'
    or octet_length(p_mining_cost::text) > 8192 or octet_length(p_woodcutting_cost::text) > 8192 then
    raise exception 'Woodcutting axe crafting data is invalid.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_mining_cost || p_woodcutting_cost) entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 1000000) then raise exception 'Woodcutting axe recipe is invalid.'; end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  for v_entry in select value from jsonb_array_elements(p_mining_cost) loop
    v_item_id := v_entry ->> 'item_id'; v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1 from public.discord_game_resource_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_item_id and quantity >= v_quantity for update;
    if not found then raise exception 'You do not have the required mining materials.'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_woodcutting_cost) loop
    v_item_id := v_entry ->> 'item_id'; v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1 from public.discord_woodcutting_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_item_id and quantity >= v_quantity for update;
    if not found then raise exception 'You do not have the required Woodcutting materials.'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_mining_cost) loop
    update public.discord_game_resource_inventory set quantity = quantity - (v_entry ->> 'quantity')::integer, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_entry ->> 'item_id';
    delete from public.discord_game_resource_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_entry ->> 'item_id' and quantity = 0;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_woodcutting_cost) loop
    update public.discord_woodcutting_inventory set quantity = quantity - (v_entry ->> 'quantity')::integer, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_entry ->> 'item_id';
    delete from public.discord_woodcutting_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_entry ->> 'item_id' and quantity = 0;
  end loop;
  insert into public.discord_woodcutting_axes (guild_id, discord_user_id, axe_tier)
  values (p_guild_id, p_discord_user_id, p_axe_tier) returning id into v_axe_id;
  return v_axe_id;
end;
$$;

create function public.craft_discord_woodcutting_upgrade(
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
declare v_entry jsonb; v_item_id text; v_quantity integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_upgrade_id !~ '^[a-z][a-z0-9-]{0,63}$'
    or jsonb_typeof(p_mining_cost) <> 'array' or jsonb_typeof(p_woodcutting_cost) <> 'array' then raise exception 'Woodcutting upgrade crafting data is invalid.'; end if;
  if exists (select 1 from jsonb_array_elements(p_mining_cost || p_woodcutting_cost) entries(value)
    where coalesce(entries.value ->> 'item_id' ~ '^[a-z][a-z0-9-]{0,63}$', false) = false
      or coalesce(entries.value ->> 'quantity' ~ '^[1-9][0-9]*$', false) = false
      or (entries.value ->> 'quantity')::integer > 1000000) then raise exception 'Woodcutting upgrade recipe is invalid.'; end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  if exists (select 1 from public.discord_woodcutting_upgrades where guild_id = p_guild_id and discord_user_id = p_discord_user_id and upgrade_id = p_upgrade_id) then raise exception 'You already own that Woodcutting upgrade.'; end if;
  for v_entry in select value from jsonb_array_elements(p_mining_cost) loop
    v_item_id := v_entry ->> 'item_id'; v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1 from public.discord_game_resource_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_item_id and quantity >= v_quantity for update;
    if not found then raise exception 'You do not have the required mining materials.'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_woodcutting_cost) loop
    v_item_id := v_entry ->> 'item_id'; v_quantity := (v_entry ->> 'quantity')::integer;
    perform 1 from public.discord_woodcutting_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_item_id and quantity >= v_quantity for update;
    if not found then raise exception 'You do not have the required Woodcutting materials.'; end if;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_mining_cost) loop
    update public.discord_game_resource_inventory set quantity = quantity - (v_entry ->> 'quantity')::integer, updated_at = now() where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_entry ->> 'item_id';
    delete from public.discord_game_resource_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and resource_id = v_entry ->> 'item_id' and quantity = 0;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_woodcutting_cost) loop
    update public.discord_woodcutting_inventory set quantity = quantity - (v_entry ->> 'quantity')::integer, updated_at = now() where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_entry ->> 'item_id';
    delete from public.discord_woodcutting_inventory where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = v_entry ->> 'item_id' and quantity = 0;
  end loop;
  insert into public.discord_woodcutting_upgrades (guild_id, discord_user_id, upgrade_id) values (p_guild_id, p_discord_user_id, p_upgrade_id);
end;
$$;

create function public.assign_discord_woodcutting_worker(
  p_guild_id text,
  p_discord_user_id text,
  p_worker_number smallint,
  p_axe_id bigint,
  p_sapling_tier smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_axe_tier smallint; v_current_worker smallint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_worker_number not between 1 and 10 or p_axe_id < 1 or p_sapling_tier not between 1 and 7 then
    raise exception 'Woodcutting assignment data is invalid.';
  end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  perform 1 from public.discord_woodcutting_workers where guild_id = p_guild_id and discord_user_id = p_discord_user_id and worker_number = p_worker_number for update;
  if not found then raise exception 'That lumberjack has not been hired.'; end if;
  select axe_tier into v_axe_tier from public.discord_woodcutting_axes where id = p_axe_id and guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  if not found then raise exception 'That axe is unavailable.'; end if;
  if p_sapling_tier > v_axe_tier then raise exception 'A lumberjack cannot chop a sapling above their axe tier.'; end if;
  select worker_number into v_current_worker from public.discord_woodcutting_workers where axe_id = p_axe_id;
  if found and v_current_worker <> p_worker_number then raise exception 'That axe is already assigned to another lumberjack.'; end if;
  update public.discord_woodcutting_workers
  set axe_id = p_axe_id, sapling_tier = p_sapling_tier, chop_remainder_ms = 0, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id and worker_number = p_worker_number;
end;
$$;

create function public.assign_discord_woodcutting_workers_automatically(
  p_guild_id text,
  p_discord_user_id text,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_entry jsonb; v_worker_number smallint; v_axe_id bigint; v_sapling_tier smallint; v_axe_tier smallint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or jsonb_typeof(p_assignments) <> 'array' or octet_length(p_assignments::text) > 4096 then raise exception 'Woodcutting auto-assignment data is invalid.'; end if;
  if exists (select 1 from jsonb_array_elements(p_assignments) entries(value)
    where coalesce(entries.value ->> 'worker_number' ~ '^(10|[1-9])$', false) = false
      or coalesce(entries.value ->> 'axe_id' ~ '^[1-9][0-9]*$', false) = false
      or coalesce(entries.value ->> 'sapling_tier' ~ '^[1-7]$', false) = false) then raise exception 'Woodcutting auto-assignment values are invalid.'; end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  update public.discord_woodcutting_workers set axe_id = null, sapling_tier = null, chop_remainder_ms = 0, updated_at = now() where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  for v_entry in select value from jsonb_array_elements(p_assignments) loop
    v_worker_number := (v_entry ->> 'worker_number')::smallint; v_axe_id := (v_entry ->> 'axe_id')::bigint; v_sapling_tier := (v_entry ->> 'sapling_tier')::smallint;
    perform 1 from public.discord_woodcutting_workers where guild_id = p_guild_id and discord_user_id = p_discord_user_id and worker_number = v_worker_number for update;
    if not found then raise exception 'An assigned lumberjack has not been hired.'; end if;
    select axe_tier into v_axe_tier from public.discord_woodcutting_axes where id = v_axe_id and guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
    if not found or v_sapling_tier > v_axe_tier then raise exception 'An automatic assignment is invalid.'; end if;
    update public.discord_woodcutting_workers set axe_id = v_axe_id, sapling_tier = v_sapling_tier, updated_at = now() where guild_id = p_guild_id and discord_user_id = p_discord_user_id and worker_number = v_worker_number;
  end loop;
end;
$$;

revoke all on function public.ensure_discord_woodcutting_player(text, text) from public;
revoke all on function public.claim_discord_woodcutting_rewards(text, text, timestamptz, jsonb, jsonb, jsonb) from public;
revoke all on function public.hire_discord_woodcutting_worker(text, text, bigint) from public;
revoke all on function public.purchase_discord_woodcutting_saplings(text, text, text, integer, bigint) from public;
revoke all on function public.craft_discord_woodcutting_axe(text, text, smallint, jsonb, jsonb) from public;
revoke all on function public.craft_discord_woodcutting_upgrade(text, text, text, jsonb, jsonb) from public;
revoke all on function public.assign_discord_woodcutting_worker(text, text, smallint, bigint, smallint) from public;
revoke all on function public.assign_discord_woodcutting_workers_automatically(text, text, jsonb) from public;
grant execute on function public.ensure_discord_woodcutting_player(text, text) to service_role;
grant execute on function public.claim_discord_woodcutting_rewards(text, text, timestamptz, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.hire_discord_woodcutting_worker(text, text, bigint) to service_role;
grant execute on function public.purchase_discord_woodcutting_saplings(text, text, text, integer, bigint) to service_role;
grant execute on function public.craft_discord_woodcutting_axe(text, text, smallint, jsonb, jsonb) to service_role;
grant execute on function public.craft_discord_woodcutting_upgrade(text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.assign_discord_woodcutting_worker(text, text, smallint, bigint, smallint) to service_role;
grant execute on function public.assign_discord_woodcutting_workers_automatically(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
