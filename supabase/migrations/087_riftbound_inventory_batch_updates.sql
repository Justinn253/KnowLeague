-- Apply a saved inventory draft in one transaction. The previous API path
-- loaded and rewrote every inventory row, which became increasingly costly and
-- could lose concurrent changes. A user-scoped advisory lock makes retries and
-- simultaneous saves deterministic.
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

notify pgrst, 'reload schema';
