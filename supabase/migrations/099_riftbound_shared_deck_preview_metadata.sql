-- Add the creator and share metadata needed for shared deck previews to match
-- community post cards.

alter table public.riftbound_shared_decks
  add column if not exists created_by_username text,
  add column if not exists created_by_avatar_url text,
  add column if not exists share_count integer not null default 0 check (share_count >= 0);

update public.riftbound_shared_decks as shared_decks
set created_by_username = profiles.username,
    created_by_avatar_url = profiles.avatar_url,
    share_count = coalesce(post_totals.share_count, 0),
    updated_at = now()
from public.riftbound_posts as posts
join public.profiles as profiles on profiles.id = posts.author_id
left join (
  select shared_deck_id, sum(share_count)::integer as share_count
  from public.riftbound_posts
  where shared_deck_id is not null
  group by shared_deck_id
) as post_totals on post_totals.shared_deck_id = posts.shared_deck_id
where posts.shared_deck_id = shared_decks.id
  and shared_decks.created_by_username is null;

create or replace function public.record_riftbound_shared_deck_share(p_shared_deck_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.riftbound_shared_decks
  set share_count = share_count + 1,
      updated_at = now()
  where id = p_shared_deck_id
  returning share_count;
$$;

revoke all on function public.record_riftbound_shared_deck_share(uuid) from public, anon, authenticated;
grant execute on function public.record_riftbound_shared_deck_share(uuid) to service_role;

notify pgrst, 'reload schema';
