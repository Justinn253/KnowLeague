create table if not exists public.riftbound_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' constraint riftbound_decks_description_length_check check (char_length(description) <= 500),
  legend_card_id text not null,
  chosen_champion_card_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_decks_user_idx
  on public.riftbound_decks(user_id, created_at);

create table if not exists public.riftbound_deck_cards (
  deck_id uuid not null references public.riftbound_decks(id) on delete cascade,
  card_id text not null,
  category text not null check (category in ('legend', 'runes', 'battlefields', 'main', 'sideboard')),
  quantity integer not null check (quantity > 0 and quantity <= 1000),
  primary key (deck_id, card_id, category)
);

create index if not exists riftbound_deck_cards_card_idx
  on public.riftbound_deck_cards(card_id);

alter table public.riftbound_decks enable row level security;
alter table public.riftbound_deck_cards enable row level security;

revoke all on table public.riftbound_decks from anon, authenticated;
revoke all on table public.riftbound_deck_cards from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_decks to service_role;
grant select, insert, update, delete on table public.riftbound_deck_cards to service_role;

create or replace function public.create_riftbound_deck(
  p_user_id uuid,
  p_name text,
  p_legend_card_id text,
  p_chosen_champion_card_id text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  legend_card_id text,
  chosen_champion_card_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_deck_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Deck name must be between 1 and 80 characters.';
  end if;

  if p_legend_card_id is null or p_chosen_champion_card_id is null then
    raise exception 'A Legend and Chosen Champion are required.';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 or jsonb_array_length(p_cards) > 1180 then
    raise exception 'A deck must contain between 1 and 1180 card rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer)
    where card.card_id is null
      or card.category is null
      or card.category not in ('legend', 'runes', 'battlefields', 'main', 'sideboard')
      or card.quantity is null
      or card.quantity < 1
      or card.quantity > 1000
  ) then
    raise exception 'Deck cards contain invalid categories or quantities.';
  end if;

  if exists (
    select card.card_id, card.category
    from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer)
    group by card.card_id, card.category
    having count(*) > 1
  ) then
    raise exception 'Deck cards contain duplicate category/card rows.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'legend'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 1
    or (select count(*) from jsonb_to_recordset(p_cards) as card(category text) where card.category = 'legend') <> 1 then
    raise exception 'A deck must contain exactly 1 Legend.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'runes'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 12 then
    raise exception 'A deck must contain exactly 12 Runes.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'battlefields'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 3 then
    raise exception 'A deck must contain exactly 3 Battlefields.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'main'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 40 then
    raise exception 'A Main Deck must contain exactly 40 cards.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'sideboard'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) not in (0, 8) then
    raise exception 'A Sideboard must contain either 0 or 8 cards.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.riftbound_decks (user_id, name, legend_card_id, chosen_champion_card_id)
  values (p_user_id, btrim(p_name), p_legend_card_id, p_chosen_champion_card_id)
  returning riftbound_decks.id into created_deck_id;

  insert into public.riftbound_deck_cards (deck_id, card_id, category, quantity)
  select created_deck_id, card.card_id, card.category, card.quantity
  from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer);

  return query
  select decks.id, decks.name, decks.legend_card_id, decks.chosen_champion_card_id, decks.created_at, decks.updated_at
  from public.riftbound_decks as decks
  where decks.id = created_deck_id;
end;
$$;

create or replace function public.update_riftbound_deck(
  p_user_id uuid,
  p_deck_id uuid,
  p_name text,
  p_legend_card_id text,
  p_chosen_champion_card_id text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  legend_card_id text,
  chosen_champion_card_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_deck_id is null then
    raise exception 'A user and deck are required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Deck name must be between 1 and 80 characters.';
  end if;

  if p_legend_card_id is null or p_chosen_champion_card_id is null then
    raise exception 'A Legend and Chosen Champion are required.';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 or jsonb_array_length(p_cards) > 1180 then
    raise exception 'A deck must contain between 1 and 1180 card rows.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer)
    where card.card_id is null
      or card.category is null
      or card.category not in ('legend', 'runes', 'battlefields', 'main', 'sideboard')
      or card.quantity is null
      or card.quantity < 1
      or card.quantity > 1000
  ) then
    raise exception 'Deck cards contain invalid categories or quantities.';
  end if;

  if exists (
    select card.card_id, card.category
    from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer)
    group by card.card_id, card.category
    having count(*) > 1
  ) then
    raise exception 'Deck cards contain duplicate category/card rows.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'legend'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 1
    or (select count(*) from jsonb_to_recordset(p_cards) as card(category text) where card.category = 'legend') <> 1 then
    raise exception 'A deck must contain exactly 1 Legend.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'runes'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 12 then
    raise exception 'A deck must contain exactly 12 Runes.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'battlefields'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 3 then
    raise exception 'A deck must contain exactly 3 Battlefields.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'main'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) <> 40 then
    raise exception 'A Main Deck must contain exactly 40 cards.';
  end if;

  if (select coalesce(sum(quantity) filter (where category = 'sideboard'), 0) from jsonb_to_recordset(p_cards) as card(category text, quantity integer)) not in (0, 8) then
    raise exception 'A Sideboard must contain either 0 or 8 cards.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.riftbound_decks
  set name = btrim(p_name),
      legend_card_id = p_legend_card_id,
      chosen_champion_card_id = p_chosen_champion_card_id,
      updated_at = now()
  where id = p_deck_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Riftbound deck not found.';
  end if;

  delete from public.riftbound_deck_cards where deck_id = p_deck_id;

  insert into public.riftbound_deck_cards (deck_id, card_id, category, quantity)
  select p_deck_id, card.card_id, card.category, card.quantity
  from jsonb_to_recordset(p_cards) as card(card_id text, category text, quantity integer);

  return query
  select decks.id, decks.name, decks.legend_card_id, decks.chosen_champion_card_id, decks.created_at, decks.updated_at
  from public.riftbound_decks as decks
  where decks.id = p_deck_id;
end;
$$;

revoke all on function public.create_riftbound_deck(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_riftbound_deck(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_riftbound_deck(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.update_riftbound_deck(uuid, uuid, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
