-- Keep the high-frequency Riftbound bootstrap reads index-backed as the
-- collection and price history tables grow.
create index if not exists riftbound_price_snapshots_source_date_idx
  on public.riftbound_card_price_snapshots(source, snapshot_date desc);

create index if not exists riftbound_inventory_user_updated_idx
  on public.riftbound_inventory(user_id, updated_at desc);
