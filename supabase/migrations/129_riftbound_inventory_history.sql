-- Persist inventory changes as user-visible event groups. Inventory quantities
-- remain the source of truth for current ownership; this table records the
-- Update Inventory and Review Sale actions that produced those quantities.

create table if not exists public.riftbound_inventory_history_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('inventory_update', 'sale')),
  occurred_at timestamptz not null default now(),
  sale_id uuid references public.riftbound_sales(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists riftbound_inventory_history_sale_idx
  on public.riftbound_inventory_history_groups(sale_id)
  where sale_id is not null;

create index if not exists riftbound_inventory_history_groups_user_idx
  on public.riftbound_inventory_history_groups(user_id, occurred_at desc, created_at desc);

create table if not exists public.riftbound_inventory_history_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.riftbound_inventory_history_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  finish text not null check (finish in ('normal', 'foil')),
  delta integer not null check (delta <> 0),
  sale_price_cents bigint check (sale_price_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists riftbound_inventory_history_items_group_idx
  on public.riftbound_inventory_history_items(group_id, created_at asc);

alter table public.riftbound_inventory_history_groups enable row level security;
alter table public.riftbound_inventory_history_items enable row level security;

revoke all on table public.riftbound_inventory_history_groups from anon, authenticated;
revoke all on table public.riftbound_inventory_history_items from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_inventory_history_groups to service_role;
grant select, insert, update, delete on table public.riftbound_inventory_history_items to service_role;

-- Existing sales have enough information to backfill sold events. Historical
-- Update Inventory actions cannot be reconstructed from aggregate quantities,
-- so new inventory-update events begin when this migration is applied.
insert into public.riftbound_inventory_history_groups (user_id, event_type, occurred_at, sale_id, created_at)
select sales.user_id,
       'sale',
       coalesce(sales.created_at, sales.sold_at::timestamptz),
       sales.id,
       coalesce(sales.created_at, now())
  from public.riftbound_sales as sales
 where not exists (
   select 1
     from public.riftbound_inventory_history_groups as existing
    where existing.sale_id = sales.id
 );

insert into public.riftbound_inventory_history_items (
  group_id, user_id, card_id, finish, delta, sale_price_cents, created_at
)
select groups.id,
       items.user_id,
       items.card_id,
       items.finish,
       -items.quantity,
       items.sale_price_cents,
       items.created_at
  from public.riftbound_sale_items as items
  join public.riftbound_inventory_history_groups as groups
    on groups.sale_id = items.sale_id
 where not exists (
   select 1
     from public.riftbound_inventory_history_items as existing
    where existing.group_id = groups.id
      and existing.card_id = items.card_id
      and existing.finish = items.finish
 );

create or replace function public.apply_riftbound_inventory_changes(
  p_user_id uuid,
  p_changes jsonb
)
returns table (
  card_id text,
  finish text,
  quantity integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  change_row record;
  current_quantity integer;
  next_quantity integer;
  history_group_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  if p_changes is null
    or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) = 0
    or jsonb_array_length(p_changes) > 5000 then
    raise exception 'Inventory changes must be a non-empty array of no more than 5000 rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_changes) as incoming(card_id text, finish text, delta integer)
    where incoming.card_id is null
      or incoming.finish not in ('normal', 'foil')
      or incoming.delta is null
      or incoming.delta = 0
      or abs(incoming.delta) > 1000
  ) then
    raise exception 'Inventory changes contain invalid values.';
  end if;

  -- Serialize all writes for one collection. This prevents two browser tabs
  -- from both reading the same quantity and overwriting one another.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.riftbound_inventory_history_groups (user_id, event_type)
  values (p_user_id, 'inventory_update')
  returning id into history_group_id;

  for change_row in
    select incoming.card_id, incoming.finish, sum(incoming.delta)::integer as delta
    from jsonb_to_recordset(p_changes) as incoming(card_id text, finish text, delta integer)
    group by incoming.card_id, incoming.finish
  loop
    select inventory.quantity
    into current_quantity
    from public.riftbound_inventory as inventory
    where inventory.user_id = p_user_id
      and inventory.card_id = change_row.card_id
      and inventory.finish = change_row.finish
    for update;

    next_quantity := coalesce(current_quantity, 0) + change_row.delta;

    if next_quantity <= 0 then
      delete from public.riftbound_inventory as inventory
      where inventory.user_id = p_user_id
        and inventory.card_id = change_row.card_id
        and inventory.finish = change_row.finish;
    elsif current_quantity is null then
      insert into public.riftbound_inventory (user_id, card_id, finish, quantity)
      values (p_user_id, change_row.card_id, change_row.finish, next_quantity);
    else
      update public.riftbound_inventory as inventory
      set quantity = next_quantity,
          updated_at = now()
      where inventory.user_id = p_user_id
        and inventory.card_id = change_row.card_id
        and inventory.finish = change_row.finish;
    end if;

    insert into public.riftbound_inventory_history_items (
      group_id, user_id, card_id, finish, delta
    )
    values (
      history_group_id, p_user_id, change_row.card_id, change_row.finish, change_row.delta
    );
  end loop;

  return query
  select inventory.card_id, inventory.finish, inventory.quantity, inventory.updated_at
  from public.riftbound_inventory as inventory
  where inventory.user_id = p_user_id
    and inventory.quantity > 0
  order by inventory.updated_at desc;
end;
$$;

revoke all on function public.apply_riftbound_inventory_changes(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_riftbound_inventory_changes(uuid, jsonb) to service_role;

create or replace function public.complete_riftbound_sale(
  p_user_id uuid,
  p_items jsonb,
  p_sold_at date,
  p_adjustment_cents bigint default 0
)
returns table (
  sale_id uuid,
  sold_at date,
  subtotal_cents bigint,
  adjustment_cents bigint,
  total_cents bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_item jsonb;
  item_card_id text;
  item_finish text;
  item_quantity integer;
  item_sale_price_cents bigint;
  current_quantity integer;
  item_acquisition_date date;
  item_acquisition_cost_cents bigint;
  calculated_subtotal bigint := 0;
  calculated_total bigint;
  created_sale_id uuid;
  history_group_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500 then
    raise exception 'A sale must contain between one and 500 card rows.';
  end if;

  if p_sold_at is null then
    raise exception 'A sold date is required.';
  end if;

  if p_adjustment_cents is null or p_adjustment_cents < -100000000 or p_adjustment_cents > 100000000 then
    raise exception 'The sale discount or upcharge is outside the supported range.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as candidate(value)
    group by candidate.value->>'cardId', candidate.value->>'finish'
    having count(*) > 1
  ) then
    raise exception 'A sale cannot contain duplicate card and finish rows.';
  end if;

  for sale_item in select value from jsonb_array_elements(p_items) loop
    item_card_id := sale_item->>'cardId';
    item_finish := sale_item->>'finish';
    item_quantity := (sale_item->>'quantity')::integer;
    item_sale_price_cents := (sale_item->>'salePriceCents')::bigint;

    if item_card_id is null or item_card_id = '' or item_finish not in ('normal', 'foil') then
      raise exception 'A sale contains an invalid card or finish.';
    end if;
    if item_quantity is null or item_quantity < 1 or item_quantity > 1000 then
      raise exception 'Sale quantities must be whole numbers from 1 to 1000.';
    end if;
    if item_sale_price_cents is null or item_sale_price_cents < 0 or item_sale_price_cents > 100000000 then
      raise exception 'Sale prices must be between zero and one million dollars.';
    end if;

    select quantity
      into current_quantity
      from public.riftbound_inventory
     where user_id = p_user_id and card_id = item_card_id and finish = item_finish
     for update;
    if coalesce(current_quantity, 0) < item_quantity then
      raise exception 'You do not have enough inventory to complete this sale.';
    end if;

    calculated_subtotal := calculated_subtotal + (item_quantity * item_sale_price_cents);
  end loop;

  calculated_total := calculated_subtotal + p_adjustment_cents;
  if calculated_total < 0 then
    raise exception 'The sale total cannot be negative.';
  end if;

  insert into public.riftbound_sales (user_id, sold_at, subtotal_cents, adjustment_cents, total_cents)
  values (p_user_id, p_sold_at, calculated_subtotal, p_adjustment_cents, calculated_total)
  returning id into created_sale_id;

  insert into public.riftbound_inventory_history_groups (user_id, event_type, sale_id)
  values (p_user_id, 'sale', created_sale_id)
  returning id into history_group_id;

  for sale_item in select value from jsonb_array_elements(p_items) loop
    item_card_id := sale_item->>'cardId';
    item_finish := sale_item->>'finish';
    item_quantity := (sale_item->>'quantity')::integer;
    item_sale_price_cents := (sale_item->>'salePriceCents')::bigint;

    select acquisition_date, acquisition_cost_cents
      into item_acquisition_date, item_acquisition_cost_cents
      from public.riftbound_inventory_metadata
     where user_id = p_user_id and card_id = item_card_id and finish = item_finish;

    if sale_item ? 'acquisitionDate' then
      item_acquisition_date := nullif(sale_item->>'acquisitionDate', '')::date;
    end if;
    if sale_item ? 'acquisitionCostCents' then
      item_acquisition_cost_cents := nullif(sale_item->>'acquisitionCostCents', '')::bigint;
    end if;

    insert into public.riftbound_inventory_metadata (
      user_id, card_id, finish, acquisition_date, acquisition_cost_cents, sale_price_cents, updated_at
    )
    values (
      p_user_id, item_card_id, item_finish, item_acquisition_date, item_acquisition_cost_cents, item_sale_price_cents, now()
    )
    on conflict (user_id, card_id, finish) do update
      set acquisition_date = excluded.acquisition_date,
          acquisition_cost_cents = excluded.acquisition_cost_cents,
          sale_price_cents = excluded.sale_price_cents,
          updated_at = now();

    update public.riftbound_inventory
       set quantity = quantity - item_quantity,
           updated_at = now()
     where user_id = p_user_id and card_id = item_card_id and finish = item_finish;

    delete from public.riftbound_inventory
     where user_id = p_user_id and card_id = item_card_id and finish = item_finish and quantity <= 0;

    delete from public.riftbound_inventory_metadata
     where user_id = p_user_id and card_id = item_card_id and finish = item_finish
       and not exists (
         select 1 from public.riftbound_inventory
          where user_id = p_user_id and card_id = item_card_id and finish = item_finish
       );

    insert into public.riftbound_sale_items (
      sale_id, user_id, card_id, finish, quantity, sale_price_cents,
      acquisition_date, acquisition_cost_cents
    )
    values (
      created_sale_id, p_user_id, item_card_id, item_finish, item_quantity, item_sale_price_cents,
      item_acquisition_date, item_acquisition_cost_cents
    );

    insert into public.riftbound_inventory_history_items (
      group_id, user_id, card_id, finish, delta, sale_price_cents
    )
    values (
      history_group_id, p_user_id, item_card_id, item_finish, -item_quantity, item_sale_price_cents
    );
  end loop;

  return query
  select created_sale_id, p_sold_at, calculated_subtotal, p_adjustment_cents, calculated_total;
end;
$$;

revoke all on function public.complete_riftbound_sale(uuid, jsonb, date, bigint) from public, anon, authenticated;
grant execute on function public.complete_riftbound_sale(uuid, jsonb, date, bigint) to service_role;

notify pgrst, 'reload schema';
