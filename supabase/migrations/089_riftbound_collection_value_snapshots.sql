-- Preserve the collection state that was present when each daily price
-- snapshot was captured. Recomputing history from riftbound_inventory makes
-- every prior day look like the user's current collection.
create table if not exists public.riftbound_collection_value_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  source text not null,
  value_cents bigint not null default 0 check (value_cents >= 0),
  priced_copies bigint not null default 0 check (priced_copies >= 0),
  total_copies bigint not null default 0 check (total_copies >= 0),
  captured_at timestamptz not null default now(),
  primary key (user_id, snapshot_date, source)
);

create index if not exists riftbound_collection_value_snapshots_lookup_idx
  on public.riftbound_collection_value_snapshots(user_id, source, snapshot_date desc);

alter table public.riftbound_collection_value_snapshots enable row level security;

revoke all on table public.riftbound_collection_value_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_collection_value_snapshots to service_role;

create or replace function public.capture_riftbound_collection_value_snapshot(
  p_snapshot_date date,
  p_source text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  capture_date date;
  affected_rows integer;
begin
  if p_snapshot_date is null then
    raise exception 'A price snapshot date is required.';
  end if;

  if p_source is null or btrim(p_source) = '' then
    raise exception 'A price snapshot source is required.';
  end if;

  select (max(snapshots.captured_at) at time zone 'America/New_York')::date
  into capture_date
  from public.riftbound_card_price_snapshots as snapshots
  where snapshots.snapshot_date = p_snapshot_date
    and snapshots.source = p_source;

  if capture_date is null then
    raise exception 'The requested Riftbound price snapshot does not exist.';
  end if;

  insert into public.riftbound_collection_value_snapshots (
    user_id,
    snapshot_date,
    source,
    value_cents,
    priced_copies,
    total_copies,
    captured_at
  )
  select
    inventory.user_id,
    capture_date,
    p_source,
    coalesce(sum(coalesce(prices.price_cents, 0)::bigint * inventory.quantity::bigint), 0::bigint),
    coalesce(sum(case when prices.price_cents is not null then inventory.quantity::bigint else 0::bigint end), 0::bigint),
    coalesce(sum(inventory.quantity::bigint), 0::bigint),
    coalesce(max(prices.captured_at), now())
  from public.riftbound_inventory as inventory
  left join public.riftbound_card_price_snapshots as prices
    on prices.card_id = inventory.card_id
    and prices.finish = inventory.finish
    and prices.snapshot_date = p_snapshot_date
    and prices.source = p_source
  where inventory.quantity > 0
  group by inventory.user_id
  on conflict (user_id, snapshot_date, source) do nothing;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.capture_riftbound_collection_value_snapshot(date, text) from public, anon, authenticated;
grant execute on function public.capture_riftbound_collection_value_snapshot(date, text) to service_role;

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

-- Keep price and collection snapshots in the same transaction. The
-- collection row is insert-only for a capture date, so retrying a cron run
-- cannot replace a prior day's inventory state with a later one.
create or replace function public.record_riftbound_price_snapshot(
  p_snapshot_date date,
  p_source_snapshot_at timestamptz,
  p_source text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  if p_snapshot_date is null then
    raise exception 'A snapshot date is required.';
  end if;

  if p_source is null or btrim(p_source) = '' then
    raise exception 'A price snapshot source is required.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Price snapshot rows must be a non-empty array of no more than 5000 rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as incoming(card_id text, finish text, price_cents integer, capture_status text)
    where incoming.card_id is null
      or incoming.finish not in ('normal', 'foil')
      or incoming.price_cents < 0
      or incoming.capture_status not in ('live', 'no_market_price', 'catalog_fallback', 'source_unmatched')
  ) then
    raise exception 'Price snapshot rows contain invalid values.';
  end if;

  if exists (
    select incoming.card_id, incoming.finish
    from jsonb_to_recordset(p_rows) as incoming(card_id text, finish text, price_cents integer, capture_status text)
    group by incoming.card_id, incoming.finish
    having count(*) > 1
  ) then
    raise exception 'Price snapshot rows contain duplicate card finishes.';
  end if;

  insert into public.riftbound_card_price_snapshots (
    card_id,
    finish,
    snapshot_date,
    price_cents,
    currency,
    source,
    source_snapshot_at,
    capture_status,
    captured_at
  )
  select
    incoming.card_id,
    incoming.finish,
    p_snapshot_date,
    incoming.price_cents,
    'USD',
    p_source,
    p_source_snapshot_at,
    incoming.capture_status,
    now()
  from jsonb_to_recordset(p_rows) as incoming(card_id text, finish text, price_cents integer, capture_status text)
  on conflict (card_id, finish, snapshot_date, source) do update
    set price_cents = excluded.price_cents,
        currency = excluded.currency,
        source_snapshot_at = excluded.source_snapshot_at,
        capture_status = excluded.capture_status,
        captured_at = excluded.captured_at;

  get diagnostics affected_rows = row_count;
  perform public.capture_riftbound_collection_value_snapshot(p_snapshot_date, p_source);
  return affected_rows;
end;
$$;

revoke all on function public.record_riftbound_price_snapshot(date, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_riftbound_price_snapshot(date, timestamptz, text, jsonb) to service_role;

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
stable
security definer
set search_path = public
as $$
  select
    snapshots.snapshot_date,
    snapshots.value_cents,
    snapshots.priced_copies,
    snapshots.total_copies
  from public.riftbound_collection_value_snapshots as snapshots
  where snapshots.user_id = p_user_id
    and snapshots.source = 'tcgcsv'
    and snapshots.snapshot_date between p_start_date and p_end_date
  order by snapshots.snapshot_date;
$$;

revoke all on function public.get_riftbound_collection_value_history(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_riftbound_collection_value_history(uuid, date, date) to service_role;

notify pgrst, 'reload schema';
