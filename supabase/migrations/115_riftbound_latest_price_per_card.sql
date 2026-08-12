-- A card can be added after the first live price snapshot. Select the newest
-- captured row per card/finish so current cards do not fall back to the
-- generated catalogue value merely because another card has a newer global
-- snapshot date.
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
  where snapshots.source = coalesce(nullif(btrim(p_source), ''), 'tcgcsv')
  order by snapshots.card_id, snapshots.finish, snapshots.snapshot_date desc, snapshots.captured_at desc;
$$;

revoke all on function public.get_riftbound_latest_price_snapshots(text) from public, anon, authenticated;
grant execute on function public.get_riftbound_latest_price_snapshots(text) to service_role;

notify pgrst, 'reload schema';
