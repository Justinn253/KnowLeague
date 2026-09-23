-- Community ratings for checked-in official ARAM Mayhem catalogue records.
-- Official IDs are text keys from data/catalogs/official-augments.json, so they
-- remain stable across catalogue refreshes without creating publication rows.
create table public.official_augment_reactions (
  augment_id text not null check (length(trim(augment_id)) between 1 and 150),
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction smallint not null check (reaction in (-1, 1)),
  primary key (augment_id, user_id)
);
create table public.official_augment_tiers (
  augment_id text not null check (length(trim(augment_id)) between 1 and 150),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier smallint not null check (tier between 0 and 4),
  primary key (augment_id, user_id)
);
create index official_augment_reactions_id on public.official_augment_reactions (augment_id);
create index official_augment_tiers_id on public.official_augment_tiers (augment_id);
alter table public.official_augment_reactions enable row level security;
alter table public.official_augment_tiers enable row level security;
revoke all on public.official_augment_reactions, public.official_augment_tiers from anon, authenticated;
grant select, insert, update, delete on public.official_augment_reactions, public.official_augment_tiers to service_role;

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
