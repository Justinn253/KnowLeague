-- Published community augments. Guests may publish via the rate-limited API;
-- only verified account IDs receive persistent account binder ownership.
create table public.custom_augments (
  id uuid primary key,
  creator_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  rarity text not null check (rarity in ('silver', 'gold', 'prismatic')),
  icon text not null check (length(icon) between 1 and 150),
  name text not null check (length(trim(name)) between 1 and 60),
  description text not null check (length(trim(description)) between 1 and 650),
  details text not null default '' check (length(details) <= 1200),
  long_description text not null default '' check (length(long_description) <= 4000)
);
create index custom_augments_binder on public.custom_augments (creator_id, created_at desc, id);
create table public.custom_augment_reactions (
  augment_id uuid not null references public.custom_augments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  primary key (augment_id, user_id)
);
create table public.custom_augment_tiers (
  augment_id uuid not null references public.custom_augments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier smallint not null check (tier between 0 and 4),
  primary key (augment_id, user_id)
);
alter table public.custom_augments enable row level security;
alter table public.custom_augment_reactions enable row level security;
alter table public.custom_augment_tiers enable row level security;
revoke all on public.custom_augments, public.custom_augment_reactions, public.custom_augment_tiers from anon, authenticated;
grant select, insert, update, delete on public.custom_augments, public.custom_augment_reactions, public.custom_augment_tiers to service_role;

-- Aggregate only the bounded card IDs requested by the API. No voter identities
-- are exposed, and aggregate results do not depend on PostgREST row limits.
create function public.custom_augment_ratings(p_ids uuid[])
returns table (id uuid, upvotes bigint, downvotes bigint, average_tier numeric, tier_votes bigint)
language sql stable set search_path = '' as $$
  select a.id,
    (select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = 1),
    (select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = -1),
    (select avg(t.tier) from public.custom_augment_tiers t where t.augment_id = a.id),
    (select count(*) from public.custom_augment_tiers t where t.augment_id = a.id)
  from public.custom_augments a where a.id = any(p_ids) and cardinality(p_ids) <= 24;
$$;
revoke all on function public.custom_augment_ratings(uuid[]) from public, anon, authenticated;
grant execute on function public.custom_augment_ratings(uuid[]) to service_role;
notify pgrst, 'reload schema';
