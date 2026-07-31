-- Allow Riftbound post bodies to contain up to 2,000 characters.
-- Comments and deck descriptions retain their existing limits.

alter table public.riftbound_posts
  drop constraint if exists riftbound_posts_body_check;

alter table public.riftbound_posts
  add constraint riftbound_posts_body_check check (char_length(body) <= 2000);

create or replace function public.create_riftbound_post_legacy(
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

  if p_body is null or char_length(p_body) > 2000 then
    raise exception 'Post descriptions must be 2000 characters or fewer.';
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
  if p_body is null or char_length(p_body) > 2000 then
    raise exception 'Post bodies must be 2000 characters or fewer.';
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

revoke all on function public.create_riftbound_post_legacy(uuid, text, uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_riftbound_post_legacy(uuid, text, uuid, text, text, text, jsonb, jsonb, text) to service_role;

revoke all on function public.create_riftbound_text_post(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_riftbound_text_post(uuid, text, text, text, text, jsonb, text) to service_role;
