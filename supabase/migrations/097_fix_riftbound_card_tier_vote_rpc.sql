create or replace function public.set_riftbound_card_tier_vote(
  p_user_id uuid,
  p_tier_group_id text,
  p_tier smallint
)
returns table (
  tier_group_id text,
  tier smallint,
  average_value numeric,
  vote_count integer,
  viewer_tier smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_tier smallint;
  v_next_vote_count integer;
  v_next_average_value numeric;
  v_next_tier smallint;
  v_inserted_rating integer;
begin
  if p_tier < 0 or p_tier > 4 then
    raise exception 'Invalid Riftbound card tier.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tier_group_id, 0));

  select votes.tier
    into v_previous_tier
    from public.riftbound_card_tier_votes as votes
   where votes.user_id = p_user_id
     and votes.tier_group_id = p_tier_group_id
   for update;

  if v_previous_tier is null then
    insert into public.riftbound_card_tier_votes (user_id, tier_group_id, tier, updated_at)
    values (p_user_id, p_tier_group_id, p_tier, now());
  elsif v_previous_tier <> p_tier then
    update public.riftbound_card_tier_votes as votes
       set tier = p_tier,
           updated_at = now()
     where votes.user_id = p_user_id
       and votes.tier_group_id = p_tier_group_id;
  else
    update public.riftbound_card_tier_votes as votes
       set updated_at = now()
     where votes.user_id = p_user_id
       and votes.tier_group_id = p_tier_group_id;
  end if;

  if v_previous_tier is null then
    insert into public.riftbound_card_tier_ratings (tier_group_id, tier, average_value, vote_count)
    values (p_tier_group_id, p_tier, p_tier, 1)
    on conflict (tier_group_id) do nothing;
    get diagnostics v_inserted_rating = row_count;
    if v_inserted_rating = 0 then
      update public.riftbound_card_tier_ratings as ratings
         set vote_count = ratings.vote_count + 1,
             average_value = ((ratings.average_value * ratings.vote_count) + p_tier) / (ratings.vote_count + 1),
             updated_at = now()
       where ratings.tier_group_id = p_tier_group_id;
    end if;
  elsif v_previous_tier <> p_tier then
    update public.riftbound_card_tier_ratings as ratings
       set average_value = ((ratings.average_value * ratings.vote_count) - v_previous_tier + p_tier) / ratings.vote_count,
           updated_at = now()
     where ratings.tier_group_id = p_tier_group_id;
  else
    update public.riftbound_card_tier_ratings as ratings
       set updated_at = now()
     where ratings.tier_group_id = p_tier_group_id;
  end if;

  select ratings.vote_count, ratings.average_value
    into v_next_vote_count, v_next_average_value
    from public.riftbound_card_tier_ratings as ratings
   where ratings.tier_group_id = p_tier_group_id;

  v_next_tier := round(v_next_average_value)::smallint;

  update public.riftbound_card_tier_ratings as ratings
     set tier = v_next_tier
   where ratings.tier_group_id = p_tier_group_id;

  return query
  select p_tier_group_id as tier_group_id,
         v_next_tier as tier,
         v_next_average_value as average_value,
         v_next_vote_count as vote_count,
         p_tier as viewer_tier;
end;
$$;

revoke all on function public.set_riftbound_card_tier_vote(uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.set_riftbound_card_tier_vote(uuid, text, smallint) to service_role;
