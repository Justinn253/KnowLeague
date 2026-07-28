-- Riftbound community posts, immutable content snapshots, engagement, and profiles.
-- Public reads are served through authenticated API routes so authorization,
-- rate limits, and compact feed projections remain explicit.

create table if not exists public.riftbound_post_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('collection', 'set', 'deck')),
  source_id uuid,
  content_hash text not null,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  total_card_count integer not null default 0 check (total_card_count >= 0),
  total_copy_count integer not null default 0 check (total_copy_count >= 0),
  total_value_cents bigint not null default 0 check (total_value_cents >= 0),
  set_codes text[] not null default '{}',
  legend_card_id text,
  champion_card_ids text[] not null default '{}',
  battlefield_card_ids text[] not null default '{}',
  unit_card_ids text[] not null default '{}',
  has_sideboard boolean not null default false,
  preview_card_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (owner_id, content_hash),
  check ((source_type = 'collection' and source_id is null) or source_type in ('set', 'deck'))
);

create index if not exists riftbound_post_snapshots_owner_idx
  on public.riftbound_post_snapshots(owner_id, created_at desc);

create table if not exists public.riftbound_post_snapshot_cards (
  snapshot_id uuid not null references public.riftbound_post_snapshots(id) on delete cascade,
  card_id text not null,
  finish text not null default 'normal' check (finish in ('normal', 'foil')),
  category text not null check (category in ('collection', 'set', 'deck', 'legend', 'runes', 'battlefields', 'main', 'sideboard')),
  quantity integer not null check (quantity > 0 and quantity <= 1000),
  primary key (snapshot_id, card_id, finish, category)
);

create index if not exists riftbound_post_snapshot_cards_card_idx
  on public.riftbound_post_snapshot_cards(card_id, snapshot_id);

create table if not exists public.riftbound_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_id uuid not null references public.riftbound_post_snapshots(id) on delete restrict,
  post_type text not null check (post_type in ('collection', 'set', 'deck')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 1000),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'removed')),
  total_card_count integer not null default 0 check (total_card_count >= 0),
  total_copy_count integer not null default 0 check (total_copy_count >= 0),
  total_value_cents bigint not null default 0 check (total_value_cents >= 0),
  set_codes text[] not null default '{}',
  legend_card_id text,
  champion_card_ids text[] not null default '{}',
  battlefield_card_ids text[] not null default '{}',
  unit_card_ids text[] not null default '{}',
  has_sideboard boolean not null default false,
  preview_card_ids text[] not null default '{}',
  like_count integer not null default 0 check (like_count >= 0),
  dislike_count integer not null default 0 check (dislike_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  share_count integer not null default 0 check (share_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_posts_recent_idx
  on public.riftbound_posts(visibility, created_at desc, id desc);

create index if not exists riftbound_posts_price_idx
  on public.riftbound_posts(visibility, total_value_cents, id desc);

create index if not exists riftbound_posts_type_recent_idx
  on public.riftbound_posts(visibility, post_type, created_at desc, id desc);

create index if not exists riftbound_posts_sideboard_recent_idx
  on public.riftbound_posts(visibility, has_sideboard, created_at desc, id desc);

create index if not exists riftbound_posts_set_codes_gin_idx
  on public.riftbound_posts using gin(set_codes);

create index if not exists riftbound_posts_champions_gin_idx
  on public.riftbound_posts using gin(champion_card_ids);

create index if not exists riftbound_posts_battlefields_gin_idx
  on public.riftbound_posts using gin(battlefield_card_ids);

create index if not exists riftbound_posts_units_gin_idx
  on public.riftbound_posts using gin(unit_card_ids);

create table if not exists public.riftbound_post_reactions (
  post_id uuid not null references public.riftbound_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists riftbound_post_reactions_user_idx
  on public.riftbound_post_reactions(user_id, updated_at desc);

create table if not exists public.riftbound_post_engagement_daily (
  post_id uuid not null references public.riftbound_posts(id) on delete cascade,
  engagement_date date not null,
  like_count integer not null default 0 check (like_count >= 0),
  dislike_count integer not null default 0 check (dislike_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  primary key (post_id, engagement_date)
);

create index if not exists riftbound_post_engagement_daily_date_idx
  on public.riftbound_post_engagement_daily(engagement_date desc, post_id);

create table if not exists public.riftbound_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.riftbound_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.riftbound_post_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_post_comments_post_idx
  on public.riftbound_post_comments(post_id, created_at desc, id desc);

create index if not exists riftbound_post_comments_author_idx
  on public.riftbound_post_comments(author_id, created_at desc);

create table if not exists public.riftbound_post_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.riftbound_posts(id) on delete cascade,
  comment_id uuid references public.riftbound_post_comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'misinformation', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  check ((post_id is not null and comment_id is null) or (post_id is null and comment_id is not null))
);

create unique index if not exists riftbound_post_reports_post_unique_idx
  on public.riftbound_post_reports(reporter_id, post_id)
  where post_id is not null;

create unique index if not exists riftbound_post_reports_comment_unique_idx
  on public.riftbound_post_reports(reporter_id, comment_id)
  where comment_id is not null;

create table if not exists public.riftbound_profile_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  about text not null default '' check (char_length(about) <= 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.riftbound_profile_favorite_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.riftbound_profile_favorite_sets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  set_id uuid not null references public.riftbound_sets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

create table if not exists public.riftbound_profile_favorite_decks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  deck_id uuid not null references public.riftbound_decks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

create table if not exists public.riftbound_profile_wishlist_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null,
  desired_quantity integer not null default 1 check (desired_quantity between 1 and 1000),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.riftbound_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text not null default 'inactive' check (status in ('active', 'inactive', 'past_due', 'canceled')),
  premium_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_entitlements_active_idx
  on public.riftbound_entitlements(plan, status, premium_until);

alter table public.riftbound_post_snapshots enable row level security;
alter table public.riftbound_post_snapshot_cards enable row level security;
alter table public.riftbound_posts enable row level security;
alter table public.riftbound_post_reactions enable row level security;
alter table public.riftbound_post_engagement_daily enable row level security;
alter table public.riftbound_post_comments enable row level security;
alter table public.riftbound_post_reports enable row level security;
alter table public.riftbound_profile_settings enable row level security;
alter table public.riftbound_profile_favorite_cards enable row level security;
alter table public.riftbound_profile_favorite_sets enable row level security;
alter table public.riftbound_profile_favorite_decks enable row level security;
alter table public.riftbound_profile_wishlist_cards enable row level security;
alter table public.riftbound_entitlements enable row level security;

revoke all on table public.riftbound_post_snapshots from anon, authenticated;
revoke all on table public.riftbound_post_snapshot_cards from anon, authenticated;
revoke all on table public.riftbound_posts from anon, authenticated;
revoke all on table public.riftbound_post_reactions from anon, authenticated;
revoke all on table public.riftbound_post_engagement_daily from anon, authenticated;
revoke all on table public.riftbound_post_comments from anon, authenticated;
revoke all on table public.riftbound_post_reports from anon, authenticated;
revoke all on table public.riftbound_profile_settings from anon, authenticated;
revoke all on table public.riftbound_profile_favorite_cards from anon, authenticated;
revoke all on table public.riftbound_profile_favorite_sets from anon, authenticated;
revoke all on table public.riftbound_profile_favorite_decks from anon, authenticated;
revoke all on table public.riftbound_profile_wishlist_cards from anon, authenticated;
revoke all on table public.riftbound_entitlements from anon, authenticated;

grant select, insert, update, delete on table public.riftbound_post_snapshots to service_role;
grant select, insert, update, delete on table public.riftbound_post_snapshot_cards to service_role;
grant select, insert, update, delete on table public.riftbound_posts to service_role;
grant select, insert, update, delete on table public.riftbound_post_reactions to service_role;
grant select, insert, update, delete on table public.riftbound_post_engagement_daily to service_role;
grant select, insert, update, delete on table public.riftbound_post_comments to service_role;
grant select, insert, update, delete on table public.riftbound_post_reports to service_role;
grant select, insert, update, delete on table public.riftbound_profile_settings to service_role;
grant select, insert, update, delete on table public.riftbound_profile_favorite_cards to service_role;
grant select, insert, update, delete on table public.riftbound_profile_favorite_sets to service_role;
grant select, insert, update, delete on table public.riftbound_profile_favorite_decks to service_role;
grant select, insert, update, delete on table public.riftbound_profile_wishlist_cards to service_role;
grant select, insert, update, delete on table public.riftbound_entitlements to service_role;

create or replace function public.create_riftbound_post(
  p_author_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_title text,
  p_body text,
  p_content_hash text,
  p_snapshot jsonb,
  p_cards jsonb,
  p_visibility text default 'public'
)
returns table (post_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot_id uuid;
  created_snapshot boolean := false;
  snapshot_row public.riftbound_post_snapshots%rowtype;
  post_limit integer;
  existing_posts integer;
begin
  if p_author_id is null then
    raise exception 'A user is required.';
  end if;

  if p_source_type not in ('collection', 'set', 'deck') then
    raise exception 'Invalid Riftbound post type.';
  end if;

  if p_source_type = 'collection' and p_source_id is not null then
    raise exception 'Collections do not have a source id.';
  end if;

  if p_source_type in ('set', 'deck') and p_source_id is null then
    raise exception 'A source is required for this post type.';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 80 then
    raise exception 'Post titles must be between 1 and 80 characters.';
  end if;

  if p_body is null or char_length(p_body) > 1000 then
    raise exception 'Post descriptions must be 1000 characters or fewer.';
  end if;

  if p_visibility not in ('public', 'unlisted') then
    raise exception 'Invalid post visibility.';
  end if;

  if p_content_hash is null or char_length(btrim(p_content_hash)) < 16 then
    raise exception 'A post snapshot hash is required.';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'A post snapshot is required.';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 or jsonb_array_length(p_cards) > 5000 then
    raise exception 'A post must contain between 1 and 5000 card rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_cards) as card(card_id text, finish text, category text, quantity integer)
    where card.card_id is null
      or card.finish not in ('normal', 'foil')
      or card.category not in ('collection', 'set', 'deck', 'legend', 'runes', 'battlefields', 'main', 'sideboard')
      or card.quantity is null
      or card.quantity < 1
      or card.quantity > 1000
  ) then
    raise exception 'Post cards contain invalid values.';
  end if;

  if exists (
    select card.card_id, card.finish, card.category
    from jsonb_to_recordset(p_cards) as card(card_id text, finish text, category text, quantity integer)
    group by card.card_id, card.finish, card.category
    having count(*) > 1
  ) then
    raise exception 'Post cards contain duplicate rows.';
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
      owner_id,
      source_type,
      source_id,
      content_hash,
      title,
      description,
      total_card_count,
      total_copy_count,
      total_value_cents,
      set_codes,
      legend_card_id,
      champion_card_ids,
      battlefield_card_ids,
      unit_card_ids,
      has_sideboard,
      preview_card_ids
    )
    values (
      p_author_id,
      p_source_type,
      p_source_id,
      p_content_hash,
      btrim(coalesce(p_snapshot->>'title', p_title)),
      left(coalesce(p_snapshot->>'description', ''), 500),
      greatest(0, coalesce((p_snapshot->>'totalCardCount')::integer, 0)),
      greatest(0, coalesce((p_snapshot->>'totalCopyCount')::integer, 0)),
      greatest(0, coalesce((p_snapshot->>'totalValueCents')::bigint, 0)),
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(p_snapshot->'setCodes', '[]'::jsonb))), '{}'::text[]),
      nullif(p_snapshot->>'legendCardId', ''),
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(p_snapshot->'championCardIds', '[]'::jsonb))), '{}'::text[]),
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(p_snapshot->'battlefieldCardIds', '[]'::jsonb))), '{}'::text[]),
      coalesce((select array_agg(value order by value) from jsonb_array_elements_text(coalesce(p_snapshot->'unitCardIds', '[]'::jsonb))), '{}'::text[]),
      coalesce((p_snapshot->>'hasSideboard')::boolean, false),
      coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(p_snapshot->'previewCardIds', '[]'::jsonb))), '{}'::text[])
    )
    on conflict (owner_id, content_hash) do nothing
    returning id into snapshot_id;

    if snapshot_id is null then
      select snapshots.id
      into snapshot_id
      from public.riftbound_post_snapshots as snapshots
      where snapshots.owner_id = p_author_id
        and snapshots.content_hash = p_content_hash;
    else
      created_snapshot := true;
    end if;
  end if;

  if snapshot_id is null then
    raise exception 'Unable to create the post snapshot.';
  end if;

  if created_snapshot then
    insert into public.riftbound_post_snapshot_cards (snapshot_id, card_id, finish, category, quantity)
    select snapshot_id, card.card_id, card.finish, card.category, card.quantity
    from jsonb_to_recordset(p_cards) as card(card_id text, finish text, category text, quantity integer);
  end if;

  select *
  into snapshot_row
  from public.riftbound_post_snapshots as snapshots
  where snapshots.id = snapshot_id;

  insert into public.riftbound_posts (
    author_id,
    snapshot_id,
    post_type,
    title,
    body,
    visibility,
    total_card_count,
    total_copy_count,
    total_value_cents,
    set_codes,
    legend_card_id,
    champion_card_ids,
    battlefield_card_ids,
    unit_card_ids,
    has_sideboard,
    preview_card_ids
  )
  values (
    p_author_id,
    snapshot_id,
    p_source_type,
    btrim(p_title),
    btrim(p_body),
    p_visibility,
    snapshot_row.total_card_count,
    snapshot_row.total_copy_count,
    snapshot_row.total_value_cents,
    snapshot_row.set_codes,
    snapshot_row.legend_card_id,
    snapshot_row.champion_card_ids,
    snapshot_row.battlefield_card_ids,
    snapshot_row.unit_card_ids,
    snapshot_row.has_sideboard,
    snapshot_row.preview_card_ids
  )
  returning id into post_id;

  return next;
end;
$$;

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
    and posts.visibility in ('public', 'unlisted')
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

  if old_reaction is not null and old_reaction = p_reaction then
    next_reaction := null;
  end if;

  if old_reaction = 'like' then like_delta := like_delta - 1; end if;
  if old_reaction = 'dislike' then dislike_delta := dislike_delta - 1; end if;
  if next_reaction = 'like' then like_delta := like_delta + 1; end if;
  if next_reaction = 'dislike' then dislike_delta := dislike_delta + 1; end if;

  if old_reaction is null and next_reaction is not null then
    insert into public.riftbound_post_reactions (post_id, user_id, reaction_type)
    values (p_post_id, p_user_id, next_reaction);
  elsif old_reaction is not null and next_reaction is null then
    delete from public.riftbound_post_reactions
    where post_id = p_post_id and user_id = p_user_id;
  elsif old_reaction is not null and next_reaction is not null then
    update public.riftbound_post_reactions
    set reaction_type = next_reaction,
        updated_at = now()
    where post_id = p_post_id and user_id = p_user_id;
  end if;

  update public.riftbound_posts
  set like_count = greatest(0, like_count + like_delta),
      dislike_count = greatest(0, dislike_count + dislike_delta),
      updated_at = now()
  where id = p_post_id;

  if like_delta <> 0 or dislike_delta <> 0 then
    insert into public.riftbound_post_engagement_daily (post_id, engagement_date, like_count, dislike_count)
    values (p_post_id, current_date, greatest(0, like_delta), greatest(0, dislike_delta))
    on conflict (post_id, engagement_date) do update
    set like_count = greatest(0, riftbound_post_engagement_daily.like_count + like_delta),
        dislike_count = greatest(0, riftbound_post_engagement_daily.dislike_count + dislike_delta);
  end if;

  return query
  select posts.like_count, posts.dislike_count, next_reaction
  from public.riftbound_posts as posts
  where posts.id = p_post_id;
end;
$$;

create or replace function public.record_riftbound_post_share(p_post_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.riftbound_posts
  set share_count = share_count + 1,
      updated_at = now()
  where id = p_post_id
    and visibility in ('public', 'unlisted')
  returning share_count;
$$;

create or replace function public.sync_riftbound_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  count_delta integer := 0;
begin
  if tg_op = 'INSERT' and new.status = 'visible' then
    count_delta := 1;
  elsif tg_op = 'UPDATE' and old.status <> new.status then
    if old.status = 'visible' then count_delta := count_delta - 1; end if;
    if new.status = 'visible' then count_delta := count_delta + 1; end if;
  end if;

  if count_delta <> 0 then
    update public.riftbound_posts
    set comment_count = greatest(0, comment_count + count_delta),
        updated_at = now()
    where id = coalesce(new.post_id, old.post_id);

    insert into public.riftbound_post_engagement_daily (post_id, engagement_date, comment_count)
    values (coalesce(new.post_id, old.post_id), current_date, greatest(0, count_delta))
    on conflict (post_id, engagement_date) do update
    set comment_count = greatest(0, riftbound_post_engagement_daily.comment_count + count_delta);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists riftbound_comment_count_trigger on public.riftbound_post_comments;
create trigger riftbound_comment_count_trigger
after insert or update of status on public.riftbound_post_comments
for each row execute function public.sync_riftbound_comment_count();

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
  p_has_sideboard boolean default null
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
with daily_scores as (
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
  where posts.visibility = 'public'
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

revoke all on function public.create_riftbound_post(uuid, text, uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.react_riftbound_post(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_riftbound_post_share(uuid) from public, anon, authenticated;
revoke all on function public.sync_riftbound_comment_count() from public, anon, authenticated;
revoke all on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.create_riftbound_post(uuid, text, uuid, text, text, text, jsonb, jsonb, text) to service_role;
grant execute on function public.react_riftbound_post(uuid, uuid, text) to service_role;
grant execute on function public.record_riftbound_post_share(uuid) to service_role;
grant execute on function public.get_riftbound_community_feed(text, integer, bigint, uuid, uuid, text, text, text, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
