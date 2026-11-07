-- Bound website workspace reads without changing the stored mock-opening
-- history shared with the Discord bot. The UI only renders the newest 96
-- packs, so return an already-trimmed JSON payload instead of transferring
-- every card from large multi-product Discord openings.

create or replace function public.get_riftbound_mock_opening_history(
  p_user_id uuid,
  p_max_packs integer default 96,
  p_max_openings integer default 96
)
returns table (
  id uuid,
  set_code text,
  opening_kind text,
  packs_opened integer,
  cards jsonb,
  opened_at timestamptz,
  opening_source text,
  reveal_expires_at timestamptz,
  revealed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_max_packs integer := greatest(1, least(coalesce(p_max_packs, 96), 96));
  safe_max_openings integer := greatest(1, least(coalesce(p_max_openings, 96), 96));
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  return query
  with ranked_openings as (
    select
      openings.id,
      openings.set_code,
      openings.opening_kind,
      openings.packs_opened,
      openings.cards,
      openings.opened_at,
      openings.opening_source,
      openings.reveal_expires_at,
      openings.revealed_at,
      coalesce(
        sum(openings.packs_opened) over (
          order by openings.opened_at desc, openings.id desc
          rows between unbounded preceding and 1 preceding
        ),
        0
      ) as preceding_packs
    from public.riftbound_mock_openings as openings
    where openings.user_id = p_user_id
      and (
        openings.opening_source = 'discord'
        or openings.revealed_at is not null
        or (openings.reveal_expires_at is not null and openings.reveal_expires_at <= now())
      )
    order by openings.opened_at desc, openings.id desc
    limit safe_max_openings
  ), bounded_openings as (
    select
      ranked_openings.*,
      least(ranked_openings.packs_opened, safe_max_packs - ranked_openings.preceding_packs)::integer as returned_packs
    from ranked_openings
    where ranked_openings.preceding_packs < safe_max_packs
  )
  select
    opening.id,
    opening.set_code,
    opening.opening_kind,
    opening.returned_packs,
    coalesce((
      select jsonb_agg(card.value order by card.ordinality)
      from jsonb_array_elements(opening.cards) with ordinality as card(value, ordinality)
      where card.ordinality <= opening.returned_packs * 13
    ), '[]'::jsonb),
    opening.opened_at,
    opening.opening_source,
    opening.reveal_expires_at,
    opening.revealed_at
  from bounded_openings as opening
  order by opening.opened_at desc, opening.id desc;
end;
$$;

create or replace function public.get_riftbound_mock_opening_totals(
  p_user_id uuid
)
returns table (
  set_code text,
  packs_opened bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  return query
  select openings.set_code, coalesce(sum(openings.packs_opened), 0)::bigint
  from public.riftbound_mock_openings as openings
  where openings.user_id = p_user_id
  group by openings.set_code;
end;
$$;

revoke all on function public.get_riftbound_mock_opening_history(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_riftbound_mock_opening_totals(uuid) from public, anon, authenticated;
grant execute on function public.get_riftbound_mock_opening_history(uuid, integer, integer) to service_role;
grant execute on function public.get_riftbound_mock_opening_totals(uuid) to service_role;

notify pgrst, 'reload schema';
