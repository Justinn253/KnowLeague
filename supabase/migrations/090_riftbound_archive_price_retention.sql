-- Historical card-price archives are intentionally retained beyond the normal
-- 365-day operational snapshot window. They never create collection snapshots.
create or replace function public.prune_riftbound_price_snapshots(
  p_keep_days integer default 365,
  p_batch_size integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_keep_days integer := greatest(1, least(coalesce(p_keep_days, 365), 365));
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 5000), 10000));
  deleted_rows integer;
  deleted_collection_rows integer;
begin
  with candidates as (
    select snapshot.card_id, snapshot.finish, snapshot.snapshot_date, snapshot.source
    from public.riftbound_card_price_snapshots as snapshot
    where snapshot.source not like 'tcgcsv_archive%'
      and snapshot.snapshot_date < current_date - (safe_keep_days - 1)
    order by snapshot.snapshot_date
    limit safe_batch_size
  )
  delete from public.riftbound_card_price_snapshots as snapshot
  where (snapshot.card_id, snapshot.finish, snapshot.snapshot_date, snapshot.source) in (
    select card_id, finish, snapshot_date, source
    from candidates
  );

  get diagnostics deleted_rows = row_count;

  delete from public.riftbound_collection_value_snapshots as snapshot
  where (snapshot.user_id, snapshot.snapshot_date, snapshot.source) in (
    select candidate.user_id, candidate.snapshot_date, candidate.source
    from public.riftbound_collection_value_snapshots as candidate
    where candidate.snapshot_date < current_date - (safe_keep_days - 1)
    order by candidate.snapshot_date
    limit safe_batch_size
  );

  get diagnostics deleted_collection_rows = row_count;
  return deleted_rows + deleted_collection_rows;
end;
$$;

revoke all on function public.prune_riftbound_price_snapshots(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_riftbound_price_snapshots(integer, integer) to service_role;

notify pgrst, 'reload schema';
