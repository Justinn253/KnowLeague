-- Durable, compact-key Riftbound collection, set, and deck shares.
-- The payload stores card IDs and quantities only; catalogue images and market
-- data continue to come from the application catalogue and latest snapshots.

create table if not exists public.riftbound_shared_snapshots (
  share_key text primary key check (share_key ~ '^[A-Za-z0-9_-]{12}$'),
  owner_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('collection', 'set', 'deck')),
  title text not null default '' check (char_length(title) <= 160),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists riftbound_shared_snapshots_owner_idx
  on public.riftbound_shared_snapshots(owner_id, created_at desc)
  where owner_id is not null;

create index if not exists riftbound_shared_snapshots_recent_idx
  on public.riftbound_shared_snapshots(created_at desc, share_key desc);

alter table public.riftbound_shared_snapshots enable row level security;

revoke all on table public.riftbound_shared_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_shared_snapshots to service_role;
