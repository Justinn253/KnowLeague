alter table public.riftbound_shared_snapshots
  drop constraint if exists riftbound_shared_snapshots_kind_check;

alter table public.riftbound_shared_snapshots
  add constraint riftbound_shared_snapshots_kind_check
  check (kind in ('collection', 'set', 'deck', 'binder'));
