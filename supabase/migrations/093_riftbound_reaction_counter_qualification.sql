-- The return-column names of this function share names with post counters.
-- Qualify the table references so Postgres never resolves them ambiguously.

create or replace function public.react_riftbound_post(
  p_post_id uuid,
  p_user_id uuid,
  p_reaction text
)
returns table (
  like_count integer,
  dislike_count integer,
  reaction text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  old_reaction text;
  like_delta integer := 0;
  dislike_delta integer := 0;
  next_reaction text := p_reaction;
begin
  if p_post_id is null or p_user_id is null then
    raise exception 'A post and user are required.';
  end if;

  if p_reaction is not null and p_reaction not in ('like', 'dislike') then
    raise exception 'Invalid post reaction.';
  end if;

  perform 1
  from public.riftbound_posts as posts
  where posts.id = p_post_id
    and (
      posts.visibility in ('public', 'unlisted')
      or (posts.visibility = 'friends' and (
        posts.author_id = p_user_id
        or exists (
          select 1 from public.friendships as friendships
          where friendships.ended_at is null
            and ((friendships.user_one_id = p_user_id and friendships.user_two_id = posts.author_id)
              or (friendships.user_two_id = p_user_id and friendships.user_one_id = posts.author_id))
        )
      ))
    )
  for update;

  if not found then
    raise exception 'Riftbound post not found.';
  end if;

  select reactions.reaction_type
  into old_reaction
  from public.riftbound_post_reactions as reactions
  where reactions.post_id = p_post_id
    and reactions.user_id = p_user_id
  for update;

  if old_reaction is not null and old_reaction = p_reaction then next_reaction := null; end if;
  if old_reaction = 'like' then like_delta := like_delta - 1; end if;
  if old_reaction = 'dislike' then dislike_delta := dislike_delta - 1; end if;
  if next_reaction = 'like' then like_delta := like_delta + 1; end if;
  if next_reaction = 'dislike' then dislike_delta := dislike_delta + 1; end if;

  if old_reaction is null and next_reaction is not null then
    insert into public.riftbound_post_reactions (post_id, user_id, reaction_type) values (p_post_id, p_user_id, next_reaction);
  elsif old_reaction is not null and next_reaction is null then
    delete from public.riftbound_post_reactions where post_id = p_post_id and user_id = p_user_id;
  elsif old_reaction is not null and next_reaction is not null then
    update public.riftbound_post_reactions set reaction_type = next_reaction, updated_at = now() where post_id = p_post_id and user_id = p_user_id;
  end if;

  update public.riftbound_posts as posts
  set like_count = greatest(0, posts.like_count + like_delta),
      dislike_count = greatest(0, posts.dislike_count + dislike_delta),
      updated_at = now()
  where posts.id = p_post_id;

  if like_delta <> 0 or dislike_delta <> 0 then
    insert into public.riftbound_post_engagement_daily (post_id, engagement_date, like_count, dislike_count)
    values (p_post_id, current_date, greatest(0, like_delta), greatest(0, dislike_delta))
    on conflict (post_id, engagement_date) do update
    set like_count = greatest(0, riftbound_post_engagement_daily.like_count + like_delta),
        dislike_count = greatest(0, riftbound_post_engagement_daily.dislike_count + dislike_delta);
  end if;

  return query select posts.like_count, posts.dislike_count, next_reaction from public.riftbound_posts as posts where posts.id = p_post_id;
end;
$$;

revoke all on function public.react_riftbound_post(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.react_riftbound_post(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
