begin;

alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add',
    'collection_sell', 'collection_steal', 'fishing_expedition',
    'fishing_shop_purchase', 'fishing_chest_open'
  ));

create table public.discord_fishing_players (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  equipped_rod_id text not null default 'starter-rod' check (equipped_rod_id ~ '^[a-z0-9-]{1,64}$'),
  equipped_bait_id text not null default 'basic-bait' check (equipped_bait_id ~ '^[a-z0-9-]{1,64}$'),
  equipped_storage_id text not null default 'bucket' check (equipped_storage_id ~ '^[a-z0-9-]{1,64}$'),
  equipped_boat_id text not null default 'dinghy' check (equipped_boat_id ~ '^[a-z0-9-]{1,64}$'),
  crew_slots smallint not null default 1 check (crew_slots between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

create table public.discord_fishing_inventory (
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  item_id text not null check (item_id ~ '^[a-z0-9-]{1,64}$'),
  quantity integer not null default 1 check (quantity >= 1 and quantity <= 1000000),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, item_id),
  foreign key (guild_id, discord_user_id)
    references public.discord_fishing_players(guild_id, discord_user_id) on delete cascade
);

create table public.discord_fishing_expeditions (
  id bigint generated always as identity primary key,
  guild_id text not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  crew_slot smallint not null check (crew_slot between 1 and 3),
  biome_id text not null check (biome_id ~ '^[a-z0-9-]{1,64}$'),
  duration_tier smallint not null check (duration_tier between 1 and 3),
  started_at timestamptz not null default now(),
  completes_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  notification_channel_id text not null check (notification_channel_id ~ '^[0-9]{17,20}$'),
  outcome_seed integer not null check (outcome_seed between 1 and 2147483647),
  equipment_snapshot jsonb not null check (jsonb_typeof(equipment_snapshot) = 'object' and octet_length(equipment_snapshot::text) <= 8192),
  result jsonb,
  knowbucks_awarded bigint not null default 0 check (knowbucks_awarded >= 0),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, discord_user_id)
    references public.discord_fishing_players(guild_id, discord_user_id) on delete cascade,
  check ((status = 'active' and result is null and settled_at is null) or (status = 'completed' and result is not null and settled_at is not null)),
  check (completes_at > started_at)
);

create unique index discord_fishing_expeditions_active_slot_idx
  on public.discord_fishing_expeditions (guild_id, discord_user_id, crew_slot)
  where status = 'active';

create index discord_fishing_expeditions_due_idx
  on public.discord_fishing_expeditions (completes_at asc, id asc)
  where status = 'active';

create index discord_fishing_expeditions_history_idx
  on public.discord_fishing_expeditions (guild_id, discord_user_id, settled_at desc, id desc);

alter table public.discord_fishing_players enable row level security;
alter table public.discord_fishing_inventory enable row level security;
alter table public.discord_fishing_expeditions enable row level security;
revoke all on table public.discord_fishing_players from anon, authenticated;
revoke all on table public.discord_fishing_inventory from anon, authenticated;
revoke all on table public.discord_fishing_expeditions from anon, authenticated;
grant select, insert, update, delete on table public.discord_fishing_players to service_role;
grant select, insert, update, delete on table public.discord_fishing_inventory to service_role;
grant select, insert, update, delete on table public.discord_fishing_expeditions to service_role;

create function public.ensure_discord_fishing_player(
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

  insert into public.discord_fishing_players (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id)
  values
    (p_guild_id, p_discord_user_id, 'starter-rod'),
    (p_guild_id, p_discord_user_id, 'basic-bait'),
    (p_guild_id, p_discord_user_id, 'bucket'),
    (p_guild_id, p_discord_user_id, 'dinghy')
  on conflict (guild_id, discord_user_id, item_id) do nothing;
end;
$$;

create function public.start_discord_fishing_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_crew_slot smallint,
  p_biome_id text,
  p_duration_tier smallint,
  p_duration_seconds integer,
  p_notification_channel_id text,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb
)
returns table (expedition_id bigint, completes_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crew_slots smallint;
  v_completes_at timestamptz;
  v_expedition_id bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_notification_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, user, and channel identifiers must be valid snowflakes.';
  end if;
  if p_crew_slot not between 1 and 3 or p_duration_tier not between 1 and 3 then
    raise exception 'Fishing crew slot and duration tier are invalid.';
  end if;
  if p_duration_seconds not between 60 and 86400 then
    raise exception 'Fishing expedition duration must be between one minute and one day.';
  end if;
  if p_biome_id !~ '^[a-z0-9-]{1,64}$' or p_outcome_seed not between 1 and 2147483647
    or jsonb_typeof(p_equipment_snapshot) <> 'object' or octet_length(p_equipment_snapshot::text) > 8192 then
    raise exception 'Fishing expedition data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select crew_slots into v_crew_slots
  from public.discord_fishing_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if p_crew_slot > v_crew_slots then
    raise exception 'That crew slot has not been unlocked.';
  end if;

  insert into public.discord_fishing_expeditions (
    guild_id, discord_user_id, crew_slot, biome_id, duration_tier, completes_at,
    notification_channel_id, outcome_seed, equipment_snapshot
  ) values (
    p_guild_id, p_discord_user_id, p_crew_slot, p_biome_id, p_duration_tier,
    now() + make_interval(secs => p_duration_seconds), p_notification_channel_id,
    p_outcome_seed, p_equipment_snapshot
  )
  returning id, public.discord_fishing_expeditions.completes_at into v_expedition_id, v_completes_at;
  return query select v_expedition_id, v_completes_at;
exception
  when unique_violation then
    raise exception 'That crew slot is already on an expedition.';
end;
$$;

create function public.purchase_discord_fishing_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text,
  p_category text,
  p_cost bigint
)
returns table (current_balance bigint, crew_slots smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_crew_slots smallint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_item_id !~ '^[a-z0-9-]{1,64}$' or p_category not in ('rod', 'bait', 'storage', 'boat', 'gear', 'skill', 'crew')
    or p_cost not between 1 and 1000000000 then
    raise exception 'Fishing shop purchase data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_fishing_players
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if exists (
    select 1 from public.discord_fishing_inventory
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id
  ) then
    raise exception 'You already own that fishing upgrade.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_balance < p_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  if p_category = 'crew' then
    select crew_slots into v_crew_slots
    from public.discord_fishing_players
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
    if v_crew_slots >= 3 then
      raise exception 'All fishing crew slots are already unlocked.';
    end if;
    v_crew_slots := v_crew_slots + 1;
    update public.discord_fishing_players
    set crew_slots = v_crew_slots, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  else
    select crew_slots into v_crew_slots
    from public.discord_fishing_players
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  end if;

  insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id)
  values (p_guild_id, p_discord_user_id, p_item_id);
  update public.discord_knowbucks_balances
  set balance = v_balance - p_cost, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  v_balance := v_balance - p_cost;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_cost, v_balance, 'fishing_shop_purchase');

  if p_category = 'rod' then
    update public.discord_fishing_players set equipped_rod_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'bait' then
    update public.discord_fishing_players set equipped_bait_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'storage' then
    update public.discord_fishing_players set equipped_storage_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'boat' then
    update public.discord_fishing_players set equipped_boat_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  end if;

  return query select v_balance, v_crew_slots;
end;
$$;

create function public.equip_discord_fishing_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text,
  p_category text
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
  if p_item_id !~ '^[a-z0-9-]{1,64}$' or p_category not in ('rod', 'bait', 'storage', 'boat') then
    raise exception 'Only rods, bait, storage, and boats can be equipped.';
  end if;
  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_fishing_inventory
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id
  for update;
  if not found then
    raise exception 'You do not own that fishing upgrade.';
  end if;

  if p_category = 'rod' then
    update public.discord_fishing_players set equipped_rod_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'bait' then
    update public.discord_fishing_players set equipped_bait_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  elsif p_category = 'storage' then
    update public.discord_fishing_players set equipped_storage_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  else
    update public.discord_fishing_players set equipped_boat_id = p_item_id, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  end if;
end;
$$;

create function public.settle_discord_fishing_expedition(
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
  knowbucks_awarded bigint
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
begin
  if p_expedition_id < 1 or p_knowbucks_awarded not between 0 and 1000000000
    or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_special_items) <> 'array'
    or octet_length(p_result::text) > 32768 or octet_length(p_special_items::text) > 8192 then
    raise exception 'Fishing settlement data is invalid.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions
  where id = p_expedition_id
  for update;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint;
    return;
  end if;

  if p_knowbucks_awarded > 0 then
    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (v_expedition.guild_id, v_expedition.discord_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    select balance into v_balance
    from public.discord_knowbucks_balances
    where guild_id = v_expedition.guild_id and discord_user_id = v_expedition.discord_user_id
    for update;
    v_balance := v_balance + p_knowbucks_awarded;
    update public.discord_knowbucks_balances
    set balance = v_balance, updated_at = now()
    where guild_id = v_expedition.guild_id and discord_user_id = v_expedition.discord_user_id;
    insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
    values (v_expedition.guild_id, v_expedition.discord_user_id, p_knowbucks_awarded, v_balance, 'fishing_expedition');
  end if;

  for v_item in select value from jsonb_array_elements(p_special_items)
  loop
    v_item_id := v_item ->> 'itemId';
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_item_id !~ '^[a-z0-9-]{1,64}$' or v_quantity not between 1 and 1000 then
      raise exception 'Fishing special item data is invalid.';
    end if;
    insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
    values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, v_quantity)
    on conflict (guild_id, discord_user_id, item_id) do update
    set quantity = public.discord_fishing_inventory.quantity + excluded.quantity,
        updated_at = now();
  end loop;

  update public.discord_fishing_expeditions
  set status = 'completed', result = p_result, knowbucks_awarded = p_knowbucks_awarded,
      settled_at = now(), updated_at = now()
  where id = v_expedition.id;
  return query select true, v_expedition.guild_id, v_expedition.discord_user_id,
    v_expedition.notification_channel_id, p_result, p_knowbucks_awarded;
end;
$$;

create function public.open_discord_fishing_chests(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text,
  p_count integer,
  p_knowbucks_awarded bigint
)
returns table (opened_count integer, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantity integer;
  v_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_item_id not in ('weathered-chest', 'deep-sea-chest') or p_count not between 1 and 25
    or p_knowbucks_awarded not between 1 and 1000000000 then
    raise exception 'Fishing chest opening data is invalid.';
  end if;
  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select quantity into v_quantity
  from public.discord_fishing_inventory
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id
  for update;
  if not found or v_quantity < p_count then
    raise exception 'You do not have enough of that chest.';
  end if;
  if v_quantity = p_count then
    delete from public.discord_fishing_inventory
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id;
  else
    update public.discord_fishing_inventory
    set quantity = quantity - p_count, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id and item_id = p_item_id;
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  v_balance := v_balance + p_knowbucks_awarded;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, p_knowbucks_awarded, v_balance, 'fishing_chest_open');
  return query select p_count, v_balance;
end;
$$;

revoke all on function public.ensure_discord_fishing_player(text, text) from public;
revoke all on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) from public;
revoke all on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint) from public;
revoke all on function public.equip_discord_fishing_upgrade(text, text, text, text) from public;
revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
revoke all on function public.open_discord_fishing_chests(text, text, text, integer, bigint) from public;
grant execute on function public.ensure_discord_fishing_player(text, text) to service_role;
grant execute on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) to service_role;
grant execute on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint) to service_role;
grant execute on function public.equip_discord_fishing_upgrade(text, text, text, text) to service_role;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;
grant execute on function public.open_discord_fishing_chests(text, text, text, integer, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
