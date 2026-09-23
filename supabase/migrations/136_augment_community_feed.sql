-- Account-owned ARAM Mayhem augments for the public community hub.
-- The service-role API calls this bounded function so feed ordering and pagination
-- happen in Postgres without exposing voter identities.
create or replace function public.custom_augment_community_feed(
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
notify pgrst, 'reload schema';
