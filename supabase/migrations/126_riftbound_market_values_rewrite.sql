begin;

-- This reset is intentional: the prior implementation mixed live and archive
-- sources between the current-value and history paths. Inventory, sales,
-- binders, decks, and catalogue data are not stored in either table below.
delete from public.riftbound_collection_value_snapshots;
delete from public.riftbound_card_price_snapshots;

create index if not exists riftbound_price_snapshots_canonical_latest_idx
  on public.riftbound_card_price_snapshots(source, snapshot_date desc, captured_at desc, card_id, finish)
  where price_cents is not null;

-- The current value is the newest known non-null value from the same canonical
-- source that the card-history endpoint reads. The application fills missing
-- card/finish combinations explicitly as unavailable.
create or replace function public.get_riftbound_latest_price_snapshots(
  p_source text default 'tcgcsv'
)
returns table (
  card_id text,
  finish text,
  snapshot_date date,
  price_cents integer,
  source_snapshot_at timestamptz,
  captured_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (snapshots.card_id, snapshots.finish)
    snapshots.card_id,
    snapshots.finish,
    snapshots.snapshot_date,
    snapshots.price_cents,
    snapshots.source_snapshot_at,
    snapshots.captured_at
  from public.riftbound_card_price_snapshots as snapshots
  where snapshots.source = 'tcgcsv'
    and coalesce(nullif(btrim(p_source), ''), 'tcgcsv') = 'tcgcsv'
    and snapshots.price_cents is not null
  order by snapshots.card_id, snapshots.finish, snapshots.snapshot_date desc, snapshots.captured_at desc;
$$;

revoke all on function public.get_riftbound_latest_price_snapshots(text) from public, anon, authenticated;
grant execute on function public.get_riftbound_latest_price_snapshots(text) to service_role;

notify pgrst, 'reload schema';

commit;
