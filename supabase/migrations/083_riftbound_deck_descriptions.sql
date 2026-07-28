alter table public.riftbound_decks
  add column if not exists description text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.riftbound_decks'::regclass
      and conname = 'riftbound_decks_description_length_check'
  ) then
    alter table public.riftbound_decks
      add constraint riftbound_decks_description_length_check check (char_length(description) <= 500);
  end if;
end;
$$;

create or replace function public.create_riftbound_deck(
  p_user_id uuid,
  p_name text,
  p_description text,
  p_legend_card_id text,
  p_chosen_champion_card_id text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  description text,
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
  if p_description is null or char_length(p_description) > 500 then
    raise exception 'Deck description must be 500 characters or fewer.';
  end if;

  select created.id
  into created_deck_id
  from public.create_riftbound_deck(
    p_user_id,
    p_name,
    p_legend_card_id,
    p_chosen_champion_card_id,
    p_cards
  ) as created;

  update public.riftbound_decks as decks
  set description = btrim(p_description)
  where decks.id = created_deck_id;

  return query
  select decks.id, decks.name, decks.description, decks.legend_card_id, decks.chosen_champion_card_id, decks.created_at, decks.updated_at
  from public.riftbound_decks as decks
  where decks.id = created_deck_id;
end;
$$;

create or replace function public.update_riftbound_deck(
  p_user_id uuid,
  p_deck_id uuid,
  p_name text,
  p_description text,
  p_legend_card_id text,
  p_chosen_champion_card_id text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  description text,
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
  updated_deck_id uuid;
begin
  if p_description is null or char_length(p_description) > 500 then
    raise exception 'Deck description must be 500 characters or fewer.';
  end if;

  select updated.id
  into updated_deck_id
  from public.update_riftbound_deck(
    p_user_id,
    p_deck_id,
    p_name,
    p_legend_card_id,
    p_chosen_champion_card_id,
    p_cards
  ) as updated;

  update public.riftbound_decks as decks
  set description = btrim(p_description),
      updated_at = now()
  where decks.id = updated_deck_id;

  return query
  select decks.id, decks.name, decks.description, decks.legend_card_id, decks.chosen_champion_card_id, decks.created_at, decks.updated_at
  from public.riftbound_decks as decks
  where decks.id = updated_deck_id;
end;
$$;

revoke all on function public.create_riftbound_deck(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_riftbound_deck(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_riftbound_deck(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.update_riftbound_deck(uuid, uuid, text, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
