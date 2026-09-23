-- Repair the augment schema when migration history exists but the objects were
-- removed by a restore, branch reset, or an incomplete schema rollout.
-- This migration is additive and preserves all existing augment data.

create table if not exists public.custom_augments (
  id uuid primary key,
  creator_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  rarity text not null check (rarity in ('silver', 'gold', 'prismatic')),
  icon text not null check (length(icon) between 1 and 150),
  name text not null check (length(trim(name)) between 1 and 60),
  description text not null check (length(trim(description)) between 1 and 650),
  details text not null default '' check (length(details) <= 1200),
  long_description text not null default '' check (length(long_description) <= 4000),
  quest_requirements text not null default '' check (length(quest_requirements) <= 1200),
  restrictions text not null default '' check (length(restrictions) <= 1200),
  notes text not null default '' check (length(notes) <= 1200)
);

alter table public.custom_augments
  add column if not exists quest_requirements text not null default '',
  add column if not exists restrictions text not null default '',
  add column if not exists notes text not null default '';

create index if not exists custom_augments_binder
  on public.custom_augments (creator_id, created_at desc, id);

create table if not exists public.custom_augment_reactions (
  augment_id uuid not null references public.custom_augments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  primary key (augment_id, user_id)
);

create table if not exists public.custom_augment_tiers (
  augment_id uuid not null references public.custom_augments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier smallint not null check (tier between 0 and 4),
  primary key (augment_id, user_id)
);

alter table public.custom_augments enable row level security;
alter table public.custom_augment_reactions enable row level security;
alter table public.custom_augment_tiers enable row level security;
revoke all on public.custom_augments, public.custom_augment_reactions, public.custom_augment_tiers from public, anon, authenticated;
grant select, insert, update, delete on public.custom_augments, public.custom_augment_reactions, public.custom_augment_tiers to service_role;

drop function if exists public.custom_augment_ratings(uuid[]);
create function public.custom_augment_ratings(p_ids uuid[])
returns table (id uuid, upvotes bigint, downvotes bigint, average_tier numeric, tier_votes bigint)
language sql stable set search_path = '' as $$
  select a.id,
    (select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = 1),
    (select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = -1),
    (select avg(t.tier) from public.custom_augment_tiers t where t.augment_id = a.id),
    (select count(*) from public.custom_augment_tiers t where t.augment_id = a.id)
  from public.custom_augments a
  where a.id = any(p_ids) and cardinality(p_ids) <= 24;
$$;
revoke all on function public.custom_augment_ratings(uuid[]) from public, anon, authenticated;
grant execute on function public.custom_augment_ratings(uuid[]) to service_role;

drop function if exists public.custom_augment_community_feed(text, text, integer, integer);
create function public.custom_augment_community_feed(
  p_sort text,
  p_query text,
  p_offset integer,
  p_limit integer
)
returns table (
  id uuid,
  creator_id uuid,
  created_at timestamptz,
  rarity text,
  icon text,
  name text,
  description text,
  details text,
  long_description text,
  quest_requirements text,
  restrictions text,
  notes text
)
language sql stable security definer set search_path = '' as $$
  with scored as (
    select
      a.*,
      coalesce((select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = 1), 0)::numeric as upvotes,
      coalesce((select count(*) from public.custom_augment_reactions r where r.augment_id = a.id and r.reaction = -1), 0)::numeric as downvotes
    from public.custom_augments a
    where a.creator_id is not null
      and (coalesce(p_query, '') = '' or lower(a.name) like '%' || lower(coalesce(p_query, '')) || '%')
      and (
        p_sort in ('newest', 'all')
        or (p_sort = 'week' and a.created_at >= now() - interval '7 days')
        or (p_sort = 'month' and a.created_at >= now() - interval '1 month')
        or (p_sort = 'year' and a.created_at >= now() - interval '1 year')
      )
  )
  select s.id, s.creator_id, s.created_at, s.rarity, s.icon, s.name, s.description,
    s.details, s.long_description, s.quest_requirements, s.restrictions, s.notes
  from scored s
  order by
    case when p_sort = 'newest' then 0 else 1 end,
    case when p_sort = 'newest' then s.created_at end desc,
    case when p_sort <> 'newest' then s.upvotes - s.downvotes end desc,
    case when p_sort <> 'newest' then s.upvotes end desc,
    s.created_at desc,
    s.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;
revoke all on function public.custom_augment_community_feed(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.custom_augment_community_feed(text, text, integer, integer) to service_role;

create table if not exists public.official_augment_reactions (
  augment_id text not null check (length(trim(augment_id)) between 1 and 150),
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  primary key (augment_id, user_id)
);

create table if not exists public.official_augment_tiers (
  augment_id text not null check (length(trim(augment_id)) between 1 and 150),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier smallint not null check (tier between 0 and 4),
  primary key (augment_id, user_id)
);

create index if not exists official_augment_reactions_id on public.official_augment_reactions (augment_id);
create index if not exists official_augment_tiers_id on public.official_augment_tiers (augment_id);
alter table public.official_augment_reactions enable row level security;
alter table public.official_augment_tiers enable row level security;
revoke all on public.official_augment_reactions, public.official_augment_tiers from public, anon, authenticated;
grant select, insert, update, delete on public.official_augment_reactions, public.official_augment_tiers to service_role;

drop function if exists public.official_augment_ratings(text[]);
create function public.official_augment_ratings(p_ids text[])
returns table (id text, upvotes bigint, downvotes bigint, average_tier numeric, tier_votes bigint)
language sql stable set search_path = '' as $$
  with ids as (
    select unnest(p_ids) as id
  )
  select ids.id,
    (select count(*) from public.official_augment_reactions r where r.augment_id = ids.id and r.reaction = 1),
    (select count(*) from public.official_augment_reactions r where r.augment_id = ids.id and r.reaction = -1),
    (select avg(t.tier) from public.official_augment_tiers t where t.augment_id = ids.id),
    (select count(*) from public.official_augment_tiers t where t.augment_id = ids.id)
  from ids
  where cardinality(p_ids) <= 24;
$$;
revoke all on function public.official_augment_ratings(text[]) from public, anon, authenticated;
grant execute on function public.official_augment_ratings(text[]) to service_role;

notify pgrst, 'reload schema';
