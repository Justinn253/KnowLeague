create or replace function public.get_riftbound_collection_value_history(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  snapshot_date date,
  value_cents bigint,
  priced_copies bigint,
  total_copies bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (snapshots.captured_at at time zone 'America/New_York')::date as snapshot_date,
    coalesce(sum(coalesce(snapshots.price_cents, 0)::bigint * inventory.quantity::bigint), 0::bigint) as value_cents,
    coalesce(sum(case when snapshots.price_cents is not null then inventory.quantity::bigint else 0::bigint end), 0::bigint) as priced_copies,
    coalesce(sum(inventory.quantity::bigint), 0::bigint) as total_copies
  from public.riftbound_card_price_snapshots as snapshots
  join public.riftbound_inventory as inventory
    on inventory.card_id = snapshots.card_id
    and inventory.finish = snapshots.finish
  where inventory.user_id = p_user_id
    and inventory.quantity > 0
    and snapshots.source = 'tcgcsv'
    and (snapshots.captured_at at time zone 'America/New_York')::date between p_start_date and p_end_date
  group by (snapshots.captured_at at time zone 'America/New_York')::date
  order by (snapshots.captured_at at time zone 'America/New_York')::date;
$$;

notify pgrst, 'reload schema';
