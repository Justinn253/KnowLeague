begin;

-- Mock cards and sealed products are already account-owned. Website openings
-- retain the guild context only because the current KnowBucks balance remains
-- Discord-guild scoped until account-wide earnings launch.
alter table public.riftbound_mock_openings
  alter column discord_user_id drop not null,
  add column opening_source text not null default 'discord'
    check (opening_source in ('discord', 'website')),
  add column reveal_expires_at timestamptz,
  add column revealed_at timestamptz;

update public.riftbound_mock_openings
set revealed_at = opened_at
where opening_source = 'discord'
  and revealed_at is null;

create index riftbound_mock_openings_website_active_idx
  on public.riftbound_mock_openings (user_id, opened_at desc)
  where opening_source = 'website' and revealed_at is null;

create or replace function public.open_riftbound_mock_web_product(
  p_opening_id uuid,
  p_user_id uuid,
  p_set_code text,
  p_opening_kind text,
  p_cards jsonb
)
returns table (
  opening_id uuid,
  packs_opened integer,
  pack_quantity integer,
  box_quantity integer,
  reveal_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id text;
  v_packs_opened integer;
  v_existing_packs integer;
  v_existing_boxes integer;
  v_boxes_to_unseal integer;
  v_remaining_packs integer;
  v_reveal_expires_at timestamptz := now() + interval '7 days';
begin
  if p_opening_id is null
    or p_user_id is null
    or p_set_code not in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')
    or p_opening_kind not in ('pack', 'box')
    or jsonb_typeof(p_cards) <> 'array'
    or octet_length(p_cards::text) > 1_000_000 then
    raise exception 'Riftbound mock opening data is invalid.';
  end if;

  -- Serializing through the profile row prevents two browser tabs from
  -- starting overlapping web openings for one account.
  perform 1
  from public.profiles
  where id = p_user_id
  for update;
  if not found then
    raise exception 'Your KnowLeague account is unavailable.';
  end if;

  if exists (
    select 1
    from public.riftbound_mock_openings as openings
    where openings.user_id = p_user_id
      and openings.opening_source = 'website'
      and openings.revealed_at is null
      and openings.reveal_expires_at > now()
  ) then
    raise exception 'You must finish revealing your current mock opening before opening another product.';
  end if;

  select products.guild_id, products.pack_quantity, products.box_quantity
  into v_guild_id, v_existing_packs, v_existing_boxes
  from public.discord_riftbound_mock_sealed_products as products
  where products.user_id = p_user_id
    and products.set_code = p_set_code
  order by products.updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'You do not have unopened Riftbound products from this set.';
  end if;

  v_packs_opened := case when p_opening_kind = 'box' then 24 else 1 end;
  if jsonb_array_length(p_cards) <> v_packs_opened * 13 then
    raise exception 'Riftbound mock opening has an unexpected card count.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_cards) as cards(value)
    where coalesce((cards.value ->> 'card_id') ~ '^[a-z0-9][a-z0-9-]{0,127}$', false) = false
      or lower(cards.value ->> 'card_id') not like lower(p_set_code) || '-%'
      or coalesce((cards.value ->> 'finish') in ('normal', 'foil'), false) = false
      or coalesce((cards.value ->> 'slot') in ('common', 'uncommon', 'foil', 'rare', 'premium'), false) = false
      or coalesce((cards.value ->> 'treatment') in ('standard', 'alt_art', 'special_alt', 'overnumbered', 'signature', 'ultimate'), false) = false
  ) then
    raise exception 'Riftbound mock opening cards are invalid.';
  end if;

  if p_opening_kind = 'box' then
    if v_existing_boxes < 1 then
      raise exception 'You do not have an unopened Riftbound box from this set.';
    end if;
    v_remaining_packs := v_existing_packs;
    v_existing_boxes := v_existing_boxes - 1;
  else
    v_boxes_to_unseal := greatest(0, ceil((1 - v_existing_packs)::numeric / 24)::integer);
    if v_existing_boxes < v_boxes_to_unseal then
      raise exception 'You do not have an unopened Riftbound pack or box from this set.';
    end if;
    v_remaining_packs := v_existing_packs + v_boxes_to_unseal * 24 - 1;
    v_existing_boxes := v_existing_boxes - v_boxes_to_unseal;
  end if;

  if v_remaining_packs = 0 and v_existing_boxes = 0 then
    delete from public.discord_riftbound_mock_sealed_products as products
    where products.guild_id = v_guild_id and products.user_id = p_user_id and products.set_code = p_set_code;
  else
    update public.discord_riftbound_mock_sealed_products as products
    set pack_quantity = v_remaining_packs,
        box_quantity = v_existing_boxes,
        updated_at = now()
    where products.guild_id = v_guild_id and products.user_id = p_user_id and products.set_code = p_set_code;
  end if;

  insert into public.riftbound_mock_openings (
    id, guild_id, user_id, discord_user_id, set_code, opening_kind, product_quantity, packs_opened, cards,
    opening_source, reveal_expires_at
  ) values (
    p_opening_id, v_guild_id, p_user_id, null, p_set_code, p_opening_kind, 1, v_packs_opened, p_cards,
    'website', v_reveal_expires_at
  );

  insert into public.riftbound_mock_inventory as inventory (
    user_id, card_id, finish, treatment, quantity, acquired_at, updated_at
  )
  select
    p_user_id,
    cards.value ->> 'card_id',
    cards.value ->> 'finish',
    cards.value ->> 'treatment',
    count(*)::integer,
    now(),
    now()
  from jsonb_array_elements(p_cards) as cards(value)
  group by cards.value ->> 'card_id', cards.value ->> 'finish', cards.value ->> 'treatment'
  on conflict (user_id, card_id, finish, treatment) do update
    set quantity = inventory.quantity + excluded.quantity,
        updated_at = now();

  opening_id := p_opening_id;
  packs_opened := v_packs_opened;
  pack_quantity := v_remaining_packs;
  box_quantity := v_existing_boxes;
  reveal_expires_at := v_reveal_expires_at;
  return next;
end;
$$;

revoke all on function public.open_riftbound_mock_web_product(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.open_riftbound_mock_web_product(uuid, uuid, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
