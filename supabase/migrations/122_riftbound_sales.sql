-- Durable Riftbound acquisition metadata and sale receipts.
-- Existing aggregate inventory rows remain the source of available quantity;
-- sale items snapshot acquisition values at the moment a sale is finalized.

create table if not exists public.riftbound_inventory_metadata (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  finish text not null check (finish in ('normal', 'foil')),
  acquisition_date date,
  acquisition_cost_cents bigint check (acquisition_cost_cents >= 0),
  sale_price_cents bigint check (sale_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id, finish)
);

alter table public.riftbound_inventory_metadata
  add column if not exists sale_price_cents bigint check (sale_price_cents >= 0);

create table if not exists public.riftbound_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sold_at date not null default current_date,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  adjustment_cents bigint not null default 0,
  total_cents bigint not null check (total_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists riftbound_sales_user_date_idx
  on public.riftbound_sales(user_id, sold_at desc, created_at desc);

create table if not exists public.riftbound_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.riftbound_sales(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  finish text not null check (finish in ('normal', 'foil')),
  quantity integer not null check (quantity > 0),
  sale_price_cents bigint not null check (sale_price_cents >= 0),
  acquisition_date date,
  acquisition_cost_cents bigint check (acquisition_cost_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists riftbound_sale_items_sale_idx
  on public.riftbound_sale_items(sale_id);

create index if not exists riftbound_sale_items_user_card_idx
  on public.riftbound_sale_items(user_id, card_id, created_at desc);

alter table public.riftbound_inventory_metadata enable row level security;
alter table public.riftbound_sales enable row level security;
alter table public.riftbound_sale_items enable row level security;

revoke all on table public.riftbound_inventory_metadata from anon, authenticated;
revoke all on table public.riftbound_sales from anon, authenticated;
revoke all on table public.riftbound_sale_items from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_inventory_metadata to service_role;
grant select, insert, update, delete on table public.riftbound_sales to service_role;
grant select, insert, update, delete on table public.riftbound_sale_items to service_role;

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
    item_sale_price_cents := (sale_item->>'salePriceCents')::integer;

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

  for sale_item in select value from jsonb_array_elements(p_items) loop
    item_card_id := sale_item->>'cardId';
    item_finish := sale_item->>'finish';
    item_quantity := (sale_item->>'quantity')::integer;
    item_sale_price_cents := (sale_item->>'salePriceCents')::integer;

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
  end loop;

  return query
  select created_sale_id, p_sold_at, calculated_subtotal, p_adjustment_cents, calculated_total;
end;
$$;

revoke all on function public.complete_riftbound_sale(uuid, jsonb, date, bigint) from public, anon, authenticated;
grant execute on function public.complete_riftbound_sale(uuid, jsonb, date, bigint) to service_role;

notify pgrst, 'reload schema';
