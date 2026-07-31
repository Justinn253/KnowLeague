-- Canonical shared Riftbound decks and reactions.
-- Deck share URLs remain self-contained; opening one registers its decoded
-- snapshot here so community discovery and reactions can use one identity.

create table if not exists public.riftbound_shared_decks (
  id uuid primary key default gen_random_uuid(),
  deck_key text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  created_by text not null default 'Unknown user' check (char_length(created_by) <= 120),
  created_by_chat_color text not null default 'amber' check (char_length(created_by_chat_color) <= 20),
  owner_id uuid references public.profiles(id) on delete set null,
  deck_created_at timestamptz,
  legend_card_id text,
  chosen_champion_card_id text,
  cards jsonb not null check (jsonb_typeof(cards) = 'array'),
  preview_card_ids text[] not null default '{}',
  total_card_count integer not null default 0 check (total_card_count >= 0),
  total_copy_count integer not null default 0 check (total_copy_count >= 0),
  share_data text,
  like_count integer not null default 0 check (like_count >= 0),
  dislike_count integer not null default 0 check (dislike_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_shared_decks_recent_idx
  on public.riftbound_shared_decks(created_at desc, id desc);

create index if not exists riftbound_shared_decks_likes_idx
  on public.riftbound_shared_decks(like_count desc, created_at desc, id desc);

create table if not exists public.riftbound_shared_deck_reactions (
  shared_deck_id uuid not null references public.riftbound_shared_decks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shared_deck_id, user_id)
);

create index if not exists riftbound_shared_deck_reactions_user_idx
  on public.riftbound_shared_deck_reactions(user_id, updated_at desc);

create table if not exists public.riftbound_shared_deck_engagement_daily (
  shared_deck_id uuid not null references public.riftbound_shared_decks(id) on delete cascade,
  engagement_date date not null,
  like_count integer not null default 0 check (like_count >= 0),
  dislike_count integer not null default 0 check (dislike_count >= 0),
  primary key (shared_deck_id, engagement_date)
);

create index if not exists riftbound_shared_deck_engagement_date_idx
  on public.riftbound_shared_deck_engagement_daily(engagement_date desc, shared_deck_id);

alter table public.riftbound_posts
  add column if not exists shared_deck_id uuid references public.riftbound_shared_decks(id) on delete set null;

create index if not exists riftbound_posts_shared_deck_idx
  on public.riftbound_posts(shared_deck_id, created_at desc)
  where shared_deck_id is not null;

alter table public.riftbound_shared_decks enable row level security;
alter table public.riftbound_shared_deck_reactions enable row level security;
alter table public.riftbound_shared_deck_engagement_daily enable row level security;

revoke all on table public.riftbound_shared_decks from anon, authenticated;
revoke all on table public.riftbound_shared_deck_reactions from anon, authenticated;
revoke all on table public.riftbound_shared_deck_engagement_daily from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_shared_decks to service_role;
grant select, insert, update, delete on table public.riftbound_shared_deck_reactions to service_role;
grant select, insert, update, delete on table public.riftbound_shared_deck_engagement_daily to service_role;

-- Register older deck posts so their existing shares and future shared URLs
-- can resolve to the same content identity. Category `deck` is normalized to
-- `main` for snapshots written by the original community implementation.
create temporary table _riftbound_shared_deck_backfill on commit drop as
with normalized_cards as (
  select
    posts.id as post_id,
    posts.title as name,
    snapshots.description,
    profiles.display_name,
    profiles.username,
    profiles.chat_color,
    snapshots.created_at as deck_created_at,
    snapshots.legend_card_id,
    snapshots.preview_card_ids,
    case cards.category when 'deck' then 'main' else cards.category end as category,
    cards.card_id,
    cards.quantity
  from public.riftbound_posts as posts
  join public.riftbound_post_snapshots as snapshots on snapshots.id = posts.snapshot_id
  join public.profiles as profiles on profiles.id = posts.author_id
  join public.riftbound_post_snapshot_cards as cards on cards.snapshot_id = snapshots.id
  where posts.post_type in ('deck', 'deck_build')
    and posts.visibility <> 'removed'
    and cards.category in ('deck', 'legend', 'runes', 'battlefields', 'main', 'sideboard')
), post_decks as (
  select
    post_id,
    name,
    coalesce(description, '') as description,
    coalesce(nullif(display_name, ''), username, 'Unknown user') as created_by,
    coalesce(nullif(chat_color, ''), 'amber') as created_by_chat_color,
    deck_created_at,
    legend_card_id,
    preview_card_ids,
    string_agg(category || ':' || card_id || ':' || quantity::text, '|' order by array_position(array['legend', 'runes', 'battlefields', 'main', 'sideboard'], category), card_id) as canonical_cards,
    jsonb_agg(jsonb_build_object('card_id', card_id, 'category', category, 'quantity', quantity) order by array_position(array['legend', 'runes', 'battlefields', 'main', 'sideboard'], category), card_id) as cards,
    count(distinct card_id)::integer as total_card_count,
    sum(quantity)::integer as total_copy_count
  from normalized_cards
  group by post_id, name, description, display_name, username, chat_color, deck_created_at, legend_card_id, preview_card_ids
)
select
  post_id,
  md5(canonical_cards) as deck_key,
  name,
  description,
  created_by,
  created_by_chat_color,
  deck_created_at,
  legend_card_id,
  preview_card_ids,
  cards,
  total_card_count,
  total_copy_count
from post_decks;

insert into public.riftbound_shared_decks (
  deck_key, name, description, created_by, created_by_chat_color, deck_created_at, legend_card_id,
  cards, preview_card_ids, total_card_count, total_copy_count
)
select distinct on (deck_key)
  deck_key, name, description, created_by, created_by_chat_color, deck_created_at, legend_card_id,
  cards, preview_card_ids, total_card_count, total_copy_count
from _riftbound_shared_deck_backfill
order by deck_key, post_id;

update public.riftbound_posts as posts
set shared_deck_id = shared_decks.id,
    updated_at = now()
from _riftbound_shared_deck_backfill as backfill
join public.riftbound_shared_decks as shared_decks on shared_decks.deck_key = backfill.deck_key
where posts.id = backfill.post_id
  and posts.shared_deck_id is null;

-- Preserve one reaction per user when multiple posts contained the same deck.
insert into public.riftbound_shared_deck_reactions (shared_deck_id, user_id, reaction_type, created_at, updated_at)
select distinct on (posts.shared_deck_id, reactions.user_id)
  posts.shared_deck_id, reactions.user_id, reactions.reaction_type, reactions.created_at, reactions.updated_at
from public.riftbound_posts as posts
join public.riftbound_post_reactions as reactions on reactions.post_id = posts.id
where posts.shared_deck_id is not null
order by posts.shared_deck_id, reactions.user_id, reactions.updated_at desc, reactions.post_id;

update public.riftbound_shared_decks as shared_decks
set like_count = coalesce(reactions.like_count, 0),
    dislike_count = coalesce(reactions.dislike_count, 0),
    updated_at = now()
from (
  select
    shared_deck_id,
    count(*) filter (where reaction_type = 'like')::integer as like_count,
    count(*) filter (where reaction_type = 'dislike')::integer as dislike_count
  from public.riftbound_shared_deck_reactions
  group by shared_deck_id
) as reactions
where shared_decks.id = reactions.shared_deck_id;

create or replace function public.react_riftbound_shared_deck(
  p_shared_deck_id uuid,
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
  next_like_count integer;
  next_dislike_count integer;
begin
  if p_shared_deck_id is null or p_user_id is null then
    raise exception 'A shared deck and user are required.';
  end if;
  if p_reaction is not null and p_reaction not in ('like', 'dislike') then
    raise exception 'Invalid shared deck reaction.';
  end if;

  perform 1
  from public.riftbound_shared_decks as shared_decks
  where shared_decks.id = p_shared_deck_id
  for update;
  if not found then
    raise exception 'Riftbound shared deck not found.';
  end if;

  select reactions.reaction_type
  into old_reaction
  from public.riftbound_shared_deck_reactions as reactions
  where reactions.shared_deck_id = p_shared_deck_id
    and reactions.user_id = p_user_id
  for update;

  if old_reaction is not null and old_reaction = p_reaction then next_reaction := null; end if;
  if old_reaction = 'like' then like_delta := -1; end if;
  if old_reaction = 'dislike' then dislike_delta := -1; end if;
  if next_reaction = 'like' then like_delta := like_delta + 1; end if;
  if next_reaction = 'dislike' then dislike_delta := dislike_delta + 1; end if;

  if old_reaction is null and next_reaction is not null then
    insert into public.riftbound_shared_deck_reactions (shared_deck_id, user_id, reaction_type)
    values (p_shared_deck_id, p_user_id, next_reaction);
  elsif old_reaction is not null and next_reaction is null then
    delete from public.riftbound_shared_deck_reactions
    where shared_deck_id = p_shared_deck_id and user_id = p_user_id;
  elsif old_reaction is not null and next_reaction is not null then
    update public.riftbound_shared_deck_reactions
    set reaction_type = next_reaction, updated_at = now()
    where shared_deck_id = p_shared_deck_id and user_id = p_user_id;
  end if;

  update public.riftbound_shared_decks as shared_decks
  set like_count = greatest(0, shared_decks.like_count + like_delta),
      dislike_count = greatest(0, shared_decks.dislike_count + dislike_delta),
      updated_at = now()
  where shared_decks.id = p_shared_deck_id
  returning shared_decks.like_count, shared_decks.dislike_count
  into next_like_count, next_dislike_count;

  if like_delta <> 0 or dislike_delta <> 0 then
    insert into public.riftbound_shared_deck_engagement_daily (shared_deck_id, engagement_date, like_count, dislike_count)
    values (p_shared_deck_id, current_date, greatest(0, like_delta), greatest(0, dislike_delta))
    on conflict (shared_deck_id, engagement_date) do update
    set like_count = greatest(0, riftbound_shared_deck_engagement_daily.like_count + like_delta),
        dislike_count = greatest(0, riftbound_shared_deck_engagement_daily.dislike_count + dislike_delta);
  end if;

  return query select next_like_count, next_dislike_count, next_reaction;
end;
$$;

revoke all on function public.react_riftbound_shared_deck(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.react_riftbound_shared_deck(uuid, uuid, text) to service_role;

-- Deck post reactions use the shared deck identity, while non-deck posts keep
-- their existing reaction behavior.
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
  shared_deck_id_value uuid;
  shared_reaction record;
  old_reaction text;
  like_delta integer := 0;
  dislike_delta integer := 0;
  next_reaction text := p_reaction;
  next_like_count integer;
  next_dislike_count integer;
begin
  select posts.shared_deck_id
  into shared_deck_id_value
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

  if shared_deck_id_value is not null then
    delete from public.riftbound_post_reactions
    where post_id = p_post_id and user_id = p_user_id;
    select * into shared_reaction
    from public.react_riftbound_shared_deck(shared_deck_id_value, p_user_id, p_reaction);
    update public.riftbound_posts as posts
    set like_count = shared_reaction.like_count,
        dislike_count = shared_reaction.dislike_count,
        updated_at = now()
    where posts.id = p_post_id;
    return query select shared_reaction.like_count, shared_reaction.dislike_count, shared_reaction.reaction;
    return;
  end if;

  -- Keep the original post reaction logic for collection, set, and text posts.
  if p_reaction is not null and p_reaction not in ('like', 'dislike') then
    raise exception 'Invalid post reaction.';
  end if;
  select reactions.reaction_type into old_reaction
  from public.riftbound_post_reactions as reactions
  where reactions.post_id = p_post_id and reactions.user_id = p_user_id
  for update;
  if old_reaction is not null and old_reaction = p_reaction then next_reaction := null; end if;
  if old_reaction = 'like' then like_delta := -1; end if;
  if old_reaction = 'dislike' then dislike_delta := -1; end if;
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
  where posts.id = p_post_id
  returning posts.like_count, posts.dislike_count into next_like_count, next_dislike_count;
  if like_delta <> 0 or dislike_delta <> 0 then
    insert into public.riftbound_post_engagement_daily (post_id, engagement_date, like_count, dislike_count)
    values (p_post_id, current_date, greatest(0, like_delta), greatest(0, dislike_delta))
    on conflict (post_id, engagement_date) do update
    set like_count = greatest(0, riftbound_post_engagement_daily.like_count + like_delta),
        dislike_count = greatest(0, riftbound_post_engagement_daily.dislike_count + dislike_delta);
  end if;
  return query select next_like_count, next_dislike_count, next_reaction;
end;
$$;

revoke all on function public.react_riftbound_post(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.react_riftbound_post(uuid, uuid, text) to service_role;

-- Preserve the existing function signature while using shared-deck counters
-- and reactions for deck posts in every community sort.
drop function if exists public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean, boolean);

create function public.get_riftbound_community_feed(
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
  shared_deck_id uuid,
  sort_value bigint
)
language sql
stable
security definer
set search_path = public
as $$
with viewer_friends as (
  select case when friendships.user_one_id = p_viewer_id then friendships.user_two_id else friendships.user_one_id end as friend_id
  from public.friendships as friendships
  where p_viewer_id is not null
    and (friendships.user_one_id = p_viewer_id or friendships.user_two_id = p_viewer_id)
    and friendships.ended_at is null
), daily_scores as (
  select engagement.post_id,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 30), 0)::bigint as thirty_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 6), 0)::bigint as seven_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date = current_date), 0)::bigint as today_likes
  from public.riftbound_post_engagement_daily as engagement
  where engagement.engagement_date >= current_date - 30
  group by engagement.post_id
), shared_daily_scores as (
  select engagement.shared_deck_id,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 30), 0)::bigint as thirty_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date >= current_date - 6), 0)::bigint as seven_day_likes,
    coalesce(sum(engagement.like_count) filter (where engagement.engagement_date = current_date), 0)::bigint as today_likes
  from public.riftbound_shared_deck_engagement_daily as engagement
  where engagement.engagement_date >= current_date - 30
  group by engagement.shared_deck_id
), candidates as (
  select
    posts.id, posts.author_id, profiles.username, profiles.display_name, profiles.avatar_url, profiles.chat_color,
    posts.post_type, posts.title, posts.body, posts.visibility, posts.total_card_count, posts.total_copy_count,
    posts.total_value_cents, posts.set_codes, posts.legend_card_id, posts.champion_card_ids, posts.battlefield_card_ids,
    posts.unit_card_ids, posts.has_sideboard, posts.preview_card_ids,
    coalesce(shared_decks.like_count, posts.like_count) as like_count,
    coalesce(shared_decks.dislike_count, posts.dislike_count) as dislike_count,
    posts.comment_count, posts.share_count, posts.created_at, posts.updated_at,
    coalesce(shared_reactions.reaction_type, reactions.reaction_type) as viewer_reaction,
    posts.shared_deck_id,
    case
      when p_sort = 'price-asc' or p_sort = 'price-desc' then posts.total_value_cents
      when p_sort = 'liked-all' then coalesce(shared_decks.like_count, posts.like_count)::bigint
      when p_sort = 'liked-month' then coalesce(shared_daily.thirty_day_likes, daily.thirty_day_likes, 0)
      when p_sort = 'liked-week' then coalesce(shared_daily.seven_day_likes, daily.seven_day_likes, 0)
      when p_sort = 'liked-today' then coalesce(shared_daily.today_likes, daily.today_likes, 0)
      else floor(extract(epoch from posts.created_at) * 1000)::bigint
    end as sort_value
  from public.riftbound_posts as posts
  join public.profiles as profiles on profiles.id = posts.author_id
  left join public.riftbound_shared_decks as shared_decks on shared_decks.id = posts.shared_deck_id
  left join public.riftbound_shared_deck_reactions as shared_reactions on shared_reactions.shared_deck_id = posts.shared_deck_id and p_viewer_id is not null and shared_reactions.user_id = p_viewer_id
  left join public.riftbound_post_reactions as reactions on reactions.post_id = posts.id and p_viewer_id is not null and reactions.user_id = p_viewer_id
  left join daily_scores as daily on daily.post_id = posts.id
  left join shared_daily_scores as shared_daily on shared_daily.shared_deck_id = posts.shared_deck_id
  where (
    posts.visibility = 'public'
    or (p_allow_friends and posts.visibility = 'friends' and (posts.author_id = p_viewer_id or posts.author_id in (select friend_id from viewer_friends)))
  )
  and (p_post_type is null or posts.post_type = p_post_type)
  and (p_set_code is null or posts.set_codes @> array[p_set_code])
  and (p_legend_card_id is null or posts.legend_card_id = p_legend_card_id)
  and (p_champion_card_id is null or posts.champion_card_ids @> array[p_champion_card_id])
  and (p_battlefield_card_id is null or posts.battlefield_card_ids @> array[p_battlefield_card_id])
  and (p_unit_card_id is null or posts.unit_card_ids @> array[p_unit_card_id])
  and (p_has_sideboard is null or posts.has_sideboard = p_has_sideboard)
)
select candidates.id, candidates.author_id, candidates.username, candidates.display_name, candidates.avatar_url, candidates.chat_color,
  candidates.post_type, candidates.title, candidates.body, candidates.visibility, candidates.total_card_count, candidates.total_copy_count,
  candidates.total_value_cents, candidates.set_codes, candidates.legend_card_id, candidates.champion_card_ids, candidates.battlefield_card_ids,
  candidates.unit_card_ids, candidates.has_sideboard, candidates.preview_card_ids, candidates.like_count, candidates.dislike_count,
  candidates.comment_count, candidates.share_count, candidates.created_at, candidates.updated_at, candidates.viewer_reaction,
  candidates.shared_deck_id, candidates.sort_value
from candidates
where p_cursor_value is null
  or ((p_sort = 'price-asc') and (candidates.sort_value > p_cursor_value or (candidates.sort_value = p_cursor_value and candidates.id > p_cursor_id)))
  or ((p_sort <> 'price-asc') and (candidates.sort_value < p_cursor_value or (candidates.sort_value = p_cursor_value and candidates.id < p_cursor_id)))
order by case when p_sort = 'price-asc' then candidates.sort_value end asc,
  case when p_sort <> 'price-asc' then candidates.sort_value end desc,
  candidates.id desc
limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean, boolean) to service_role;

notify pgrst, 'reload schema';
