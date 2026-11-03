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
    'woodcutting_worker_hire', 'riftbound_mock_pack_purchase', 'riftbound_mock_box_purchase'
  ));

create table public.riftbound_mock_box_price_snapshots (
  set_code text not null check (set_code in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')),
  week_start date not null,
  source_product_id bigint not null check (source_product_id > 0),
  source_product_name text not null check (char_length(source_product_name) between 1 and 300),
  source_snapshot_at timestamptz not null,
  box_market_cents integer not null check (box_market_cents between 1 and 10_000_000),
  box_cost_knowbucks bigint not null check (box_cost_knowbucks between 1 and 100_000_000),
  pack_cost_knowbucks bigint not null check (pack_cost_knowbucks between 1 and 100_000_000),
  captured_at timestamptz not null default now(),
  primary key (set_code, week_start)
);

create index riftbound_mock_box_price_snapshots_latest_idx
  on public.riftbound_mock_box_price_snapshots (set_code, week_start desc, captured_at desc);

create table public.discord_riftbound_mock_sealed_products (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  set_code text not null check (set_code in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')),
  pack_quantity integer not null default 0 check (pack_quantity between 0 and 1_000_000),
  box_quantity integer not null default 0 check (box_quantity between 0 and 1_000_000),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id, set_code),
  check (pack_quantity > 0 or box_quantity > 0)
);

create index discord_riftbound_mock_sealed_products_user_idx
  on public.discord_riftbound_mock_sealed_products (user_id, guild_id, set_code);

create table public.riftbound_mock_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null check (card_id ~ '^[a-z0-9][a-z0-9-]{0,127}$'),
  finish text not null check (finish in ('normal', 'foil')),
  treatment text not null check (treatment in ('standard', 'alt_art', 'special_alt', 'overnumbered', 'signature', 'ultimate')),
  quantity integer not null check (quantity between 1 and 1_000_000_000),
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id, finish, treatment)
);

create index riftbound_mock_inventory_user_idx
  on public.riftbound_mock_inventory (user_id, updated_at desc, card_id);

create table public.riftbound_mock_openings (
  id uuid primary key,
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  set_code text not null check (set_code in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')),
  opening_kind text not null check (opening_kind in ('pack', 'box')),
  product_quantity integer not null check (product_quantity between 1 and 120),
  packs_opened integer not null check (packs_opened between 1 and 2_880),
  cards jsonb not null check (jsonb_typeof(cards) = 'array'),
  opened_at timestamptz not null default now()
);

create index riftbound_mock_openings_user_idx
  on public.riftbound_mock_openings (user_id, opened_at desc);

alter table public.riftbound_mock_box_price_snapshots enable row level security;
alter table public.discord_riftbound_mock_sealed_products enable row level security;
alter table public.riftbound_mock_inventory enable row level security;
alter table public.riftbound_mock_openings enable row level security;

revoke all on table public.riftbound_mock_box_price_snapshots from anon, authenticated;
revoke all on table public.discord_riftbound_mock_sealed_products from anon, authenticated;
revoke all on table public.riftbound_mock_inventory from anon, authenticated;
revoke all on table public.riftbound_mock_openings from anon, authenticated;

create policy "Users can read their Riftbound mock inventory"
  on public.riftbound_mock_inventory for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read their Riftbound mock sealed products"
  on public.discord_riftbound_mock_sealed_products for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can read their Riftbound mock openings"
  on public.riftbound_mock_openings for select
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.riftbound_mock_box_price_snapshots to service_role;
grant select, insert, update, delete on table public.discord_riftbound_mock_sealed_products to service_role;
grant select, insert, update, delete on table public.riftbound_mock_inventory to service_role;
grant select, insert, update, delete on table public.riftbound_mock_openings to service_role;

create or replace function public.record_riftbound_mock_box_price_snapshots(
  p_week_start date,
  p_source_snapshot_at timestamptz,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_set_code text;
  v_source_product_id bigint;
  v_source_product_name text;
  v_box_market_cents integer;
  v_affected_rows integer := 0;
begin
  if p_week_start is null
    or extract(isodow from p_week_start) <> 1
    or p_source_snapshot_at is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) < 1
    or jsonb_array_length(p_rows) > 5
    or octet_length(p_rows::text) > 16_384 then
    raise exception 'Riftbound mock price snapshot data is invalid.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as rows(value)
    where coalesce((rows.value ->> 'set_code') in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD'), false) = false
      or coalesce((rows.value ->> 'source_product_id') ~ '^[1-9][0-9]{0,15}$', false) = false
      or coalesce(char_length(rows.value ->> 'source_product_name') between 1 and 300, false) = false
      or coalesce((rows.value ->> 'box_market_cents') ~ '^[1-9][0-9]*$', false) = false
      or (rows.value ->> 'box_market_cents')::bigint > 10_000_000
  ) then
    raise exception 'Riftbound mock price snapshot rows are invalid.';
  end if;

  if (select count(*) from (
    select rows.value ->> 'set_code' as set_code
    from jsonb_array_elements(p_rows) as rows(value)
    group by rows.value ->> 'set_code'
  ) as unique_sets) <> jsonb_array_length(p_rows) then
    raise exception 'Riftbound mock price snapshot rows must have unique set codes.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_set_code := v_row ->> 'set_code';
    v_source_product_id := (v_row ->> 'source_product_id')::bigint;
    v_source_product_name := v_row ->> 'source_product_name';
    v_box_market_cents := (v_row ->> 'box_market_cents')::integer;

    insert into public.riftbound_mock_box_price_snapshots as snapshots (
      set_code, week_start, source_product_id, source_product_name, source_snapshot_at,
      box_market_cents, box_cost_knowbucks, pack_cost_knowbucks, captured_at
    ) values (
      v_set_code,
      p_week_start,
      v_source_product_id,
      v_source_product_name,
      p_source_snapshot_at,
      v_box_market_cents,
      v_box_market_cents::bigint * 10,
      ceil((v_box_market_cents::numeric * 10 * 11) / 240)::bigint,
      now()
    )
    on conflict (set_code, week_start) do update
      set source_product_id = excluded.source_product_id,
          source_product_name = excluded.source_product_name,
          source_snapshot_at = excluded.source_snapshot_at,
          box_market_cents = excluded.box_market_cents,
          box_cost_knowbucks = excluded.box_cost_knowbucks,
          pack_cost_knowbucks = excluded.pack_cost_knowbucks,
          captured_at = now();
    v_affected_rows := v_affected_rows + 1;
  end loop;

  return v_affected_rows;
end;
$$;

create or replace function public.purchase_discord_riftbound_mock_product(
  p_guild_id text,
  p_discord_user_id text,
  p_set_code text,
  p_product_kind text,
  p_quantity integer
)
returns table (
  charged_knowbucks bigint,
  balance_after bigint,
  pack_quantity integer,
  box_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_unit_cost bigint;
  v_total_cost bigint;
  v_balance bigint;
  v_pack_quantity integer;
  v_box_quantity integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_set_code not in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')
    or p_product_kind not in ('pack', 'box')
    or p_quantity not between 1 and 120 then
    raise exception 'Riftbound mock purchase data is invalid.';
  end if;

  select details.user_id
  into v_user_id
  from public.profile_private_details as details
  where details.discord_user_id = p_discord_user_id
  for key share;

  if v_user_id is null then
    raise exception 'Link your KnowLeague account before using Riftbound mock unboxing.';
  end if;

  select case when p_product_kind = 'pack' then snapshots.pack_cost_knowbucks else snapshots.box_cost_knowbucks end
  into v_unit_cost
  from public.riftbound_mock_box_price_snapshots as snapshots
  where snapshots.set_code = p_set_code
  order by snapshots.week_start desc, snapshots.captured_at desc
  limit 1;

  if v_unit_cost is null then
    raise exception 'This set has no current mock box price. Please try again after the Monday market refresh.';
  end if;

  v_total_cost := v_unit_cost * p_quantity;
  if v_total_cost > 10_000_000_000 then
    raise exception 'Riftbound mock purchase cost is invalid.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balances.balance
  into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id
  for update;

  if v_balance < v_total_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  v_balance := v_balance - v_total_cost;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (
    p_guild_id,
    p_discord_user_id,
    -v_total_cost,
    v_balance,
    case when p_product_kind = 'pack' then 'riftbound_mock_pack_purchase' else 'riftbound_mock_box_purchase' end
  );

  insert into public.discord_riftbound_mock_sealed_products as products (
    guild_id, user_id, set_code, pack_quantity, box_quantity, updated_at
  ) values (
    p_guild_id,
    v_user_id,
    p_set_code,
    case when p_product_kind = 'pack' then p_quantity else 0 end,
    case when p_product_kind = 'box' then p_quantity else 0 end,
    now()
  )
  on conflict (guild_id, user_id, set_code) do update
    set pack_quantity = products.pack_quantity + excluded.pack_quantity,
        box_quantity = products.box_quantity + excluded.box_quantity,
        updated_at = now()
  returning products.pack_quantity, products.box_quantity into v_pack_quantity, v_box_quantity;

  charged_knowbucks := v_total_cost;
  balance_after := v_balance;
  pack_quantity := v_pack_quantity;
  box_quantity := v_box_quantity;
  return next;
end;
$$;

create or replace function public.open_discord_riftbound_mock_product(
  p_opening_id uuid,
  p_guild_id text,
  p_discord_user_id text,
  p_set_code text,
  p_opening_kind text,
  p_product_quantity integer,
  p_cards jsonb
)
returns table (
  opening_id uuid,
  packs_opened integer,
  pack_quantity integer,
  box_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_packs_opened integer;
  v_existing_packs integer;
  v_existing_boxes integer;
  v_boxes_to_unseal integer;
  v_remaining_packs integer;
  v_card jsonb;
begin
  if p_opening_id is null
    or p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_set_code not in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')
    or p_opening_kind not in ('pack', 'box')
    or p_product_quantity not between 1 and 120
    or jsonb_typeof(p_cards) <> 'array'
    or octet_length(p_cards::text) > 1_000_000 then
    raise exception 'Riftbound mock opening data is invalid.';
  end if;

  select details.user_id
  into v_user_id
  from public.profile_private_details as details
  where details.discord_user_id = p_discord_user_id
  for key share;

  if v_user_id is null then
    raise exception 'Link your KnowLeague account before using Riftbound mock unboxing.';
  end if;

  select openings.packs_opened
  into v_packs_opened
  from public.riftbound_mock_openings as openings
  where openings.id = p_opening_id
    and openings.guild_id = p_guild_id
    and openings.discord_user_id = p_discord_user_id;
  if found then
    select products.pack_quantity, products.box_quantity
    into pack_quantity, box_quantity
    from public.discord_riftbound_mock_sealed_products as products
    where products.guild_id = p_guild_id and products.user_id = v_user_id and products.set_code = p_set_code;
    opening_id := p_opening_id;
    packs_opened := v_packs_opened;
    return next;
    return;
  end if;

  v_packs_opened := case when p_opening_kind = 'box' then p_product_quantity * 24 else p_product_quantity end;
  if jsonb_array_length(p_cards) <> v_packs_opened * 13 then
    raise exception 'Riftbound mock opening has an unexpected card count.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_cards) as cards(value)
    where coalesce((cards.value ->> 'card_id') ~ '^[a-z0-9][a-z0-9-]{0,127}$', false) = false
      or lower(cards.value ->> 'card_id') not like lower(p_set_code) || '-%'
      or coalesce((cards.value ->> 'finish') in ('normal', 'foil'), false) = false
      or coalesce((cards.value ->> 'treatment') in ('standard', 'alt_art', 'special_alt', 'overnumbered', 'signature', 'ultimate'), false) = false
  ) then
    raise exception 'Riftbound mock opening cards are invalid.';
  end if;

  select products.pack_quantity, products.box_quantity
  into v_existing_packs, v_existing_boxes
  from public.discord_riftbound_mock_sealed_products as products
  where products.guild_id = p_guild_id
    and products.user_id = v_user_id
    and products.set_code = p_set_code
  for update;

  if not found then
    raise exception 'You do not have unopened Riftbound products from this set.';
  end if;

  if p_opening_kind = 'box' then
    if v_existing_boxes < p_product_quantity then
      raise exception 'You do not have that many unopened Riftbound boxes from this set.';
    end if;
    v_remaining_packs := v_existing_packs;
    v_existing_boxes := v_existing_boxes - p_product_quantity;
  else
    v_boxes_to_unseal := greatest(0, ceil((v_packs_opened - v_existing_packs)::numeric / 24)::integer);
    if v_existing_boxes < v_boxes_to_unseal then
      raise exception 'You do not have enough unopened packs or boxes from this set.';
    end if;
    v_remaining_packs := v_existing_packs + v_boxes_to_unseal * 24 - v_packs_opened;
    v_existing_boxes := v_existing_boxes - v_boxes_to_unseal;
  end if;

  if v_remaining_packs = 0 and v_existing_boxes = 0 then
    delete from public.discord_riftbound_mock_sealed_products as products
    where products.guild_id = p_guild_id and products.user_id = v_user_id and products.set_code = p_set_code;
  else
    update public.discord_riftbound_mock_sealed_products as products
    set pack_quantity = v_remaining_packs,
        box_quantity = v_existing_boxes,
        updated_at = now()
    where products.guild_id = p_guild_id and products.user_id = v_user_id and products.set_code = p_set_code;
  end if;

  insert into public.riftbound_mock_openings (
    id, guild_id, user_id, discord_user_id, set_code, opening_kind, product_quantity, packs_opened, cards
  ) values (
    p_opening_id, p_guild_id, v_user_id, p_discord_user_id, p_set_code,
    p_opening_kind, p_product_quantity, v_packs_opened, p_cards
  );

  insert into public.riftbound_mock_inventory as inventory (
    user_id, card_id, finish, treatment, quantity, acquired_at, updated_at
  )
  select
    v_user_id,
    cards.value ->> 'card_id',
    cards.value ->> 'finish',
    cards.value ->> 'treatment',
    count(*)::integer,
    now(),
    now()
  from jsonb_array_elements(p_cards) as cards(value)
  group by cards.value ->> 'card_id', cards.value ->> 'finish', cards.value ->> 'treatment'
  on conflict (user_id, card_id, finish, treatment) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now();

  opening_id := p_opening_id;
  packs_opened := v_packs_opened;
  pack_quantity := v_remaining_packs;
  box_quantity := v_existing_boxes;
  return next;
end;
$$;

revoke all on function public.record_riftbound_mock_box_price_snapshots(date, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.purchase_discord_riftbound_mock_product(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.open_discord_riftbound_mock_product(uuid, text, text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_riftbound_mock_box_price_snapshots(date, timestamptz, jsonb) to service_role;
grant execute on function public.purchase_discord_riftbound_mock_product(text, text, text, text, integer) to service_role;
grant execute on function public.open_discord_riftbound_mock_product(uuid, text, text, text, text, integer, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
