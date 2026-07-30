-- Riftbound community composer taxonomy and friends-only visibility.
-- Existing collection/set/deck posts remain readable as legacy records.

alter table public.riftbound_posts
  drop constraint if exists riftbound_posts_post_type_check,
  drop constraint if exists riftbound_posts_visibility_check;

alter table public.riftbound_posts
  add constraint riftbound_posts_post_type_check
    check (post_type in ('general', 'question', 'deck_build', 'collection', 'set', 'deck')),
  add constraint riftbound_posts_visibility_check
    check (visibility in ('public', 'friends', 'unlisted', 'removed'));

create index if not exists riftbound_posts_friends_recent_idx
  on public.riftbound_posts(author_id, visibility, created_at desc, id desc)
  where visibility = 'friends';

-- Keep the original function available for compatibility while the new
-- overload lets the displayed post type differ from its saved source.
alter function public.create_riftbound_post(uuid, text, uuid, text, text, text, jsonb, jsonb, text)
  rename to create_riftbound_post_legacy;

create or replace function public.create_riftbound_post(
  p_author_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_title text,
  p_body text,
  p_content_hash text,
  p_snapshot jsonb,
  p_cards jsonb,
  p_visibility text default 'public',
  p_post_type text default null
)
returns table (post_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  post_type_value text := coalesce(nullif(btrim(p_post_type), ''), p_source_type);
  created_post_id uuid;
begin
  if post_type_value not in ('general', 'question', 'deck_build', 'collection', 'set', 'deck') then
    raise exception 'Invalid Riftbound post type.';
  end if;

  if post_type_value in ('general', 'question')
    and (p_source_type <> 'collection' or p_source_id is not null) then
    raise exception 'General and Question posts use the author collection.';
  end if;

  if post_type_value = 'deck_build'
    and (p_source_type <> 'deck' or p_source_id is null) then
    raise exception 'Deck Build posts require a deck source.';
  end if;

  if p_visibility not in ('public', 'friends', 'unlisted') then
    raise exception 'Invalid post visibility.';
  end if;

  -- The legacy function performs the complete snapshot validation, source
  -- ownership check, post-limit check, and immutable snapshot insert.
  select legacy_post.post_id
  into created_post_id
  from public.create_riftbound_post_legacy(
    p_author_id,
    p_source_type,
    p_source_id,
    p_title,
    p_body,
    p_content_hash,
    p_snapshot,
    p_cards,
    case when p_visibility = 'friends' then 'public' else p_visibility end
  ) as legacy_post;

  if created_post_id is null then
    raise exception 'Unable to publish the Riftbound post.';
  end if;

  update public.riftbound_posts
  set post_type = post_type_value,
      visibility = p_visibility,
      updated_at = now()
  where id = created_post_id;

  return query select created_post_id;
end;
$$;

create or replace function public.create_riftbound_text_post(
  p_author_id uuid,
  p_post_type text,
  p_title text,
  p_body text,
  p_content_hash text,
  p_snapshot jsonb,
  p_visibility text default 'public'
)
returns table (post_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  created_post_id uuid;
  post_limit integer;
  existing_posts integer;
begin
  if p_author_id is null or p_post_type not in ('general', 'question') then
    raise exception 'Invalid Riftbound text post.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then
    raise exception 'Post titles must be between 1 and 80 characters.';
  end if;
  if p_body is null or char_length(p_body) > 1000 then
    raise exception 'Post bodies must be 1000 characters or fewer.';
  end if;
  if p_visibility not in ('public', 'friends', 'unlisted') then
    raise exception 'Invalid post visibility.';
  end if;
  if p_content_hash is null or char_length(btrim(p_content_hash)) < 16 then
    raise exception 'A post snapshot hash is required.';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'A post snapshot is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));

  select case
    when entitlement.plan = 'premium'
      and entitlement.status = 'active'
      and (entitlement.premium_until is null or entitlement.premium_until > now()) then 100
    else 10
  end
  into post_limit
  from public.riftbound_entitlements as entitlement
  where entitlement.user_id = p_author_id;
  post_limit := coalesce(post_limit, 10);

  select count(*)::integer
  into existing_posts
  from public.riftbound_posts as posts
  where posts.author_id = p_author_id
    and posts.visibility <> 'removed';
  if existing_posts >= post_limit then
    raise exception 'You have reached your Riftbound post limit. Premium accounts can publish more posts.';
  end if;

  select snapshots.id
  into snapshot_id
  from public.riftbound_post_snapshots as snapshots
  where snapshots.owner_id = p_author_id
    and snapshots.content_hash = p_content_hash;

  if snapshot_id is null then
    insert into public.riftbound_post_snapshots (
      owner_id, source_type, source_id, content_hash, title, description,
      total_card_count, total_copy_count, total_value_cents, set_codes,
      legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids,
      has_sideboard, preview_card_ids
    )
    values (
      p_author_id, 'collection', null, p_content_hash, btrim(p_title),
      left(coalesce(p_snapshot->>'description', ''), 500),
      0, 0, 0, '{}', null, '{}', '{}', '{}', false, '{}'
    )
    on conflict (owner_id, content_hash) do nothing
    returning id into snapshot_id;
    if snapshot_id is null then
      select snapshots.id into snapshot_id
      from public.riftbound_post_snapshots as snapshots
      where snapshots.owner_id = p_author_id
        and snapshots.content_hash = p_content_hash;
    end if;
  end if;

  if snapshot_id is null then
    raise exception 'Unable to create the post snapshot.';
  end if;

  insert into public.riftbound_posts (
    author_id, snapshot_id, post_type, title, body, visibility,
    total_card_count, total_copy_count, total_value_cents, set_codes,
    legend_card_id, champion_card_ids, battlefield_card_ids, unit_card_ids,
    has_sideboard, preview_card_ids
  )
  values (
    p_author_id, snapshot_id, p_post_type, btrim(p_title), btrim(p_body), p_visibility,
    0, 0, 0, '{}', null, '{}', '{}', '{}', false, '{}'
  )
  returning id into created_post_id;

  return query select created_post_id;
end;
$$;

revoke all on function public.create_riftbound_text_post(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_riftbound_text_post(uuid, text, text, text, text, jsonb, text) to service_role;

revoke all on function public.create_riftbound_post_legacy(uuid, text, uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_riftbound_post(uuid, text, uuid, text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.create_riftbound_post(uuid, text, uuid, text, text, text, jsonb, jsonb, text, text) to service_role;

create or replace function public.get_riftbound_community_feed(
  p_sort text default 'recent',
  p_limit integer default 20,
  p_cursor_value bigint default null,
  p_cursor_id uuid default null,
  p_viewer_id uuid default null,
  p_post_type text default null,
  p_set_code text default null,
  p_legend_card_id text default null,
  p_champion_card_id text default null,
  p_battlefield_card_id text default null,
  p_unit_card_id text default null,
  p_has_sideboard boolean default null,
  p_allow_friends boolean default true
)
returns table (
  id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_url text,
  chat_color text,
  post_type text,
  title text,
  body text,
  visibility text,
  total_card_count integer,
  total_copy_count integer,
  total_value_cents bigint,
  set_codes text[],
  legend_card_id text,
  champion_card_ids text[],
  battlefield_card_ids text[],
  unit_card_ids text[],
  has_sideboard boolean,
  preview_card_ids text[],
  like_count integer,
  dislike_count integer,
  comment_count integer,
  share_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  viewer_reaction text,
  sort_value bigint
)
language sql
stable
security definer
set search_path = public
as $$
with viewer_friends as (
  select case
    when friendships.user_one_id = p_viewer_id then friendships.user_two_id
    else friendships.user_one_id
  end as friend_id
  from public.friendships as friendships
  where p_viewer_id is not null
    and (friendships.user_one_id = p_viewer_id or friendships.user_two_id = p_viewer_id)
    and friendships.ended_at is null
), daily_scores as (
  select
    engagement.post_id,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 30), 0)::bigint as thirty_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 6), 0)::bigint as seven_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date = current_date), 0)::bigint as today_likes
  from public.riftbound_post_engagement_daily as engagement
  where engagement.engagement_date >= current_date - 30
  group by engagement.post_id
), candidates as (
  select
    posts.id,
    posts.author_id,
    profiles.username,
    profiles.display_name,
    profiles.avatar_url,
    profiles.chat_color,
    posts.post_type,
    posts.title,
    posts.body,
    posts.visibility,
    posts.total_card_count,
    posts.total_copy_count,
    posts.total_value_cents,
    posts.set_codes,
    posts.legend_card_id,
    posts.champion_card_ids,
    posts.battlefield_card_ids,
    posts.unit_card_ids,
    posts.has_sideboard,
    posts.preview_card_ids,
    posts.like_count,
    posts.dislike_count,
    posts.comment_count,
    posts.share_count,
    posts.created_at,
    posts.updated_at,
    reactions.reaction_type as viewer_reaction,
    case
      when p_sort = 'price-asc' or p_sort = 'price-desc' then posts.total_value_cents
      when p_sort = 'liked-all' then posts.like_count::bigint
      when p_sort = 'liked-month' then coalesce(daily.thirty_day_likes, 0)
      when p_sort = 'liked-week' then coalesce(daily.seven_day_likes, 0)
      when p_sort = 'liked-today' then coalesce(daily.today_likes, 0)
      else floor(extract(epoch from posts.created_at) * 1000)::bigint
    end as sort_value
  from public.riftbound_posts as posts
  join public.profiles as profiles on profiles.id = posts.author_id
  left join daily_scores as daily on daily.post_id = posts.id
  left join public.riftbound_post_reactions as reactions
    on reactions.post_id = posts.id
    and p_viewer_id is not null
    and reactions.user_id = p_viewer_id
  where (
      posts.visibility = 'public'
      or (
        p_allow_friends
        and posts.visibility = 'friends'
        and (
          posts.author_id = p_viewer_id
          or posts.author_id in (select friend_id from viewer_friends)
        )
      )
    )
    and (p_post_type is null or posts.post_type = p_post_type)
    and (p_set_code is null or posts.set_codes @> array[p_set_code])
    and (p_legend_card_id is null or posts.legend_card_id = p_legend_card_id)
    and (p_champion_card_id is null or posts.champion_card_ids @> array[p_champion_card_id])
    and (p_battlefield_card_id is null or posts.battlefield_card_ids @> array[p_battlefield_card_id])
    and (p_unit_card_id is null or posts.unit_card_ids @> array[p_unit_card_id])
    and (p_has_sideboard is null or posts.has_sideboard = p_has_sideboard)
)
select
  candidates.id,
  candidates.author_id,
  candidates.username,
  candidates.display_name,
  candidates.avatar_url,
  candidates.chat_color,
  candidates.post_type,
  candidates.title,
  candidates.body,
  candidates.visibility,
  candidates.total_card_count,
  candidates.total_copy_count,
  candidates.total_value_cents,
  candidates.set_codes,
  candidates.legend_card_id,
  candidates.champion_card_ids,
  candidates.battlefield_card_ids,
  candidates.unit_card_ids,
  candidates.has_sideboard,
  candidates.preview_card_ids,
  candidates.like_count,
  candidates.dislike_count,
  candidates.comment_count,
  candidates.share_count,
  candidates.created_at,
  candidates.updated_at,
  candidates.viewer_reaction,
  candidates.sort_value
from candidates
where p_cursor_value is null
  or (
    p_sort = 'price-asc'
    and (
      candidates.sort_value > p_cursor_value
      or (candidates.sort_value = p_cursor_value and candidates.id > p_cursor_id)
    )
  )
  or (
    p_sort <> 'price-asc'
    and (
      candidates.sort_value < p_cursor_value
      or (candidates.sort_value = p_cursor_value and candidates.id < p_cursor_id)
    )
  )
order by
  case when p_sort = 'price-asc' then candidates.sort_value end asc,
  case when p_sort <> 'price-asc' then candidates.sort_value end desc,
  candidates.id desc
limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean, boolean) to service_role;

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

  update public.riftbound_posts
  set like_count = greatest(0, like_count + like_delta), dislike_count = greatest(0, dislike_count + dislike_delta), updated_at = now()
  where id = p_post_id;

  if like_delta <> 0 or dislike_delta <> 0 then
    insert into public.riftbound_post_engagement_daily (post_id, engagement_date, like_count, dislike_count)
    values (p_post_id, current_date, greatest(0, like_delta), greatest(0, dislike_delta))
    on conflict (post_id, engagement_date) do update
    set like_count = greatest(0, riftbound_post_engagement_daily.like_count + like_delta), dislike_count = greatest(0, riftbound_post_engagement_daily.dislike_count + dislike_delta);
  end if;

  return query select posts.like_count, posts.dislike_count, next_reaction from public.riftbound_posts as posts where posts.id = p_post_id;
end;
$$;

create or replace function public.record_riftbound_post_share(p_post_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.riftbound_posts
  set share_count = share_count + 1, updated_at = now()
  where id = p_post_id and visibility in ('public', 'unlisted', 'friends')
  returning share_count;
$$;

revoke all on function public.react_riftbound_post(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_riftbound_post_share(uuid) from public, anon, authenticated;
grant execute on function public.react_riftbound_post(uuid, uuid, text) to service_role;
grant execute on function public.record_riftbound_post_share(uuid) to service_role;

notify pgrst, 'reload schema';
