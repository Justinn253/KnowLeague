create table if not exists public.riftbound_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  finish text not null default 'normal' check (finish in ('normal', 'foil')),
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id, finish)
);

create index if not exists riftbound_inventory_card_idx
  on public.riftbound_inventory(card_id);

alter table public.riftbound_inventory enable row level security;

drop policy if exists "Users can read their own Riftbound inventory" on public.riftbound_inventory;
create policy "Users can read their own Riftbound inventory"
  on public.riftbound_inventory for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own Riftbound inventory" on public.riftbound_inventory;
create policy "Users can insert their own Riftbound inventory"
  on public.riftbound_inventory for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Riftbound inventory" on public.riftbound_inventory;
create policy "Users can update their own Riftbound inventory"
  on public.riftbound_inventory for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Riftbound inventory" on public.riftbound_inventory;
create policy "Users can delete their own Riftbound inventory"
  on public.riftbound_inventory for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.riftbound_inventory to authenticated;
grant select, insert, update, delete on table public.riftbound_inventory to service_role;

create or replace function public.adjust_riftbound_inventory(
  p_user_id uuid,
  p_card_id text,
  p_finish text,
  p_delta integer
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
  current_quantity integer;
  next_quantity integer;
begin
  if p_finish not in ('normal', 'foil') then
    raise exception 'Invalid Riftbound finish.';
  end if;

  if p_delta not in (-1, 1) then
    raise exception 'Inventory changes must be +1 or -1.';
  end if;

  select inventory.quantity
  into current_quantity
  from public.riftbound_inventory as inventory
  where inventory.user_id = p_user_id
    and inventory.card_id = p_card_id
    and inventory.finish = p_finish
  for update;

  if not found then
    if p_delta < 0 then
      return;
    end if;

    insert into public.riftbound_inventory (user_id, card_id, finish, quantity)
    values (p_user_id, p_card_id, p_finish, 1)
    returning public.riftbound_inventory.card_id,
      public.riftbound_inventory.finish,
      public.riftbound_inventory.quantity,
      public.riftbound_inventory.updated_at
    into card_id, finish, quantity, updated_at;

    return next;
    return;
  end if;

  next_quantity := current_quantity + p_delta;
  if next_quantity <= 0 then
    delete from public.riftbound_inventory
    where user_id = p_user_id
      and card_id = p_card_id
      and finish = p_finish;
    return;
  end if;

  update public.riftbound_inventory
  set quantity = next_quantity,
      updated_at = now()
  where user_id = p_user_id
    and card_id = p_card_id
    and finish = p_finish
  returning public.riftbound_inventory.card_id,
    public.riftbound_inventory.finish,
    public.riftbound_inventory.quantity,
    public.riftbound_inventory.updated_at
  into card_id, finish, quantity, updated_at;

  return next;
end;
$$;

revoke all on function public.adjust_riftbound_inventory(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.adjust_riftbound_inventory(uuid, text, text, integer) to service_role;

notify pgrst, 'reload schema';
