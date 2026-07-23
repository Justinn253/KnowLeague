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
begin
  with candidates as (
    select snapshot.card_id, snapshot.finish, snapshot.snapshot_date, snapshot.source
    from public.riftbound_card_price_snapshots as snapshot
    where snapshot.snapshot_date < current_date - (safe_keep_days - 1)
    order by snapshot.snapshot_date
    limit safe_batch_size
  )
  delete from public.riftbound_card_price_snapshots as snapshot
  where (snapshot.card_id, snapshot.finish, snapshot.snapshot_date, snapshot.source) in (
    select card_id, finish, snapshot_date, source
    from candidates
  );

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.prune_riftbound_price_snapshots(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_riftbound_price_snapshots(integer, integer) to service_role;

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
    snapshots.snapshot_date,
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
    and snapshots.snapshot_date between p_start_date and p_end_date
  group by snapshots.snapshot_date
  order by snapshots.snapshot_date;
$$;

revoke all on function public.get_riftbound_collection_value_history(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_riftbound_collection_value_history(uuid, date, date) to service_role;

do $riftbound_collection_history_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-riftbound-price-snapshots'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-riftbound-price-snapshots',
      '15 3 * * *',
      'select public.prune_riftbound_price_snapshots(365, 5000);'
    );
  else
    raise notice 'pg_cron is not enabled; schedule public.prune_riftbound_price_snapshots(365, 5000) separately.';
  end if;
end;
$riftbound_collection_history_cron$;

notify pgrst, 'reload schema';
