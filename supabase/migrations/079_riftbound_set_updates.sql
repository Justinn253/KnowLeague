create or replace function public.update_riftbound_set(
  p_user_id uuid,
  p_set_id uuid,
  p_name text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_set_id is null then
    raise exception 'A user and set are required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Set name must be between 1 and 80 characters.';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 or jsonb_array_length(p_cards) > 1180 then
    raise exception 'A set must contain between 1 and 1180 unique cards.';
  end if;

  if exists (
    select card.card_id
    from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer)
    where card.card_id is null
      or card.quantity is null
      or card.quantity < 1
      or card.quantity > 1000
    group by card.card_id
  ) then
    raise exception 'Set cards contain invalid quantities.';
  end if;

  if exists (
    select card.card_id
    from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer)
    group by card.card_id
    having count(*) > 1
  ) then
    raise exception 'Set cards contain duplicate rows.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.riftbound_sets
  set name = btrim(p_name)
  where id = p_set_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Riftbound set not found.';
  end if;

  delete from public.riftbound_set_cards
  where set_id = p_set_id;

  insert into public.riftbound_set_cards (set_id, card_id, quantity)
  select p_set_id, card.card_id, card.quantity
  from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer);

  return query
  select sets.id, sets.name, sets.created_at
  from public.riftbound_sets as sets
  where sets.id = p_set_id;
end;
$$;

revoke all on function public.update_riftbound_set(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_riftbound_set(uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
