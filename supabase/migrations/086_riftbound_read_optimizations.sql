-- Keep the high-traffic latest-price lookup to one indexed query. The
-- application retains a compatibility fallback until this migration is live
-- in every environment.
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
  select
    snapshots.card_id,
    snapshots.finish,
    snapshots.snapshot_date,
    snapshots.price_cents,
    snapshots.source_snapshot_at,
    snapshots.captured_at
  from public.riftbound_card_price_snapshots as snapshots
  where snapshots.source = coalesce(nullif(btrim(p_source), ''), 'tcgcsv')
    and snapshots.snapshot_date = (
      select max(latest.snapshot_date)
      from public.riftbound_card_price_snapshots as latest
      where latest.source = coalesce(nullif(btrim(p_source), ''), 'tcgcsv')
    );
$$;

revoke all on function public.get_riftbound_latest_price_snapshots(text) from public, anon, authenticated;
grant execute on function public.get_riftbound_latest_price_snapshots(text) to service_role;

-- Card detail history filters by card and capture time. This complements the
-- existing lookup index without adding a wide index to the write path.
create index if not exists riftbound_price_snapshots_card_capture_idx
  on public.riftbound_card_price_snapshots(card_id, captured_at, finish);

-- Collection history starts with the source/date window and then joins the
-- user's relatively small inventory.
create index if not exists riftbound_price_snapshots_source_capture_idx
  on public.riftbound_card_price_snapshots(source, captured_at, card_id, finish);

notify pgrst, 'reload schema';
