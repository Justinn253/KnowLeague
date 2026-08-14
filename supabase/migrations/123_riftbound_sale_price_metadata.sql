-- Backfills the reusable inventory sale-price column for environments that
-- already applied migration 122 before sale-price metadata was added.

alter table public.riftbound_inventory_metadata
  add column if not exists sale_price_cents bigint;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.riftbound_inventory_metadata'::regclass
       and conname = 'riftbound_inventory_metadata_sale_price_cents_check'
  ) then
    alter table public.riftbound_inventory_metadata
      add constraint riftbound_inventory_metadata_sale_price_cents_check
      check (sale_price_cents >= 0);
  end if;
end;
$$;

notify pgrst, 'reload schema';
