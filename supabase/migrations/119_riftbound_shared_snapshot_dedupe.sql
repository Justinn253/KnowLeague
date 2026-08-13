-- Reuse a stable share key when the same owner shares the same immutable
-- collection/set/deck snapshot again. Legacy records receive unique fallback
-- keys because their original payload identity was not persisted.

alter table public.riftbound_shared_snapshots
  add column if not exists dedupe_key text;

update public.riftbound_shared_snapshots
set dedupe_key = md5('legacy:' || share_key)
where dedupe_key is null;

alter table public.riftbound_shared_snapshots
  alter column dedupe_key set not null;

create unique index if not exists riftbound_shared_snapshots_dedupe_idx
  on public.riftbound_shared_snapshots(dedupe_key);
