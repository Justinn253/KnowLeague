create table if not exists public.riftbound_card_tier_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier_group_id text not null,
  tier smallint not null check (tier between 0 and 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, tier_group_id)
);

create index if not exists riftbound_card_tier_votes_group_tier_idx
  on public.riftbound_card_tier_votes(tier_group_id, tier);

alter table public.riftbound_card_tier_votes enable row level security;

revoke all on table public.riftbound_card_tier_votes from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_card_tier_votes to service_role;
