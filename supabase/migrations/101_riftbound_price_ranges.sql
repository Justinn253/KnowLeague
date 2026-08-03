-- Preserve the low/high listing range supplied with each TCGCSV price point.
-- Existing snapshots remain valid and expose null ranges until a new capture runs.
alter table public.riftbound_card_price_snapshots
  add column if not exists low_price_cents integer check (low_price_cents is null or low_price_cents >= 0),
  add column if not exists high_price_cents integer check (high_price_cents is null or high_price_cents >= 0);

-- Keep price and collection snapshots in the same transaction while accepting
-- the expanded source row payload.
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
    from jsonb_to_recordset(p_rows) as incoming(
      card_id text,
      finish text,
      price_cents integer,
      low_price_cents integer,
      high_price_cents integer,
      capture_status text
    )
    where incoming.card_id is null
      or incoming.finish not in ('normal', 'foil')
      or incoming.price_cents < 0
      or incoming.low_price_cents < 0
      or incoming.high_price_cents < 0
      or incoming.capture_status not in ('live', 'no_market_price', 'catalog_fallback', 'source_unmatched')
  ) then
    raise exception 'Price snapshot rows contain invalid values.';
  end if;

  if exists (
    select incoming.card_id, incoming.finish
    from jsonb_to_recordset(p_rows) as incoming(
      card_id text,
      finish text,
      price_cents integer,
      low_price_cents integer,
      high_price_cents integer,
      capture_status text
    )
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
    low_price_cents,
    high_price_cents,
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
    incoming.low_price_cents,
    incoming.high_price_cents,
    'USD',
    p_source,
    p_source_snapshot_at,
    incoming.capture_status,
    now()
  from jsonb_to_recordset(p_rows) as incoming(
    card_id text,
    finish text,
    price_cents integer,
    low_price_cents integer,
    high_price_cents integer,
    capture_status text
  )
  on conflict (card_id, finish, snapshot_date, source) do update
    set price_cents = excluded.price_cents,
        low_price_cents = excluded.low_price_cents,
        high_price_cents = excluded.high_price_cents,
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

notify pgrst, 'reload schema';
