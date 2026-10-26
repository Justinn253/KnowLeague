begin;

-- The return-table field `discord_user_id` is also a PL/pgSQL variable. The
-- prior function used several unqualified table columns, which causes Postgres
-- to reject upkeep reconciliation as ambiguous. Every mutable table reference
-- below is explicitly aliased so existing upkeep, allocation, and release
-- rules remain unchanged.
create or replace function public.process_discord_skin_collection_upkeep(
  p_guild_id text
)
returns table (
  discord_user_id text,
  outcome text,
  amount bigint,
  released_count integer,
  grace_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id text;
  v_state public.discord_skin_claim_collection_upkeep%rowtype;
  v_owned_count integer;
  v_lucky_level integer;
  v_amount bigint;
  v_balance bigint;
  v_allocation bigint;
  v_allocation_used bigint;
  v_balance_used bigint;
  v_released_count integer;
  v_today date := (now() at time zone 'UTC')::date;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;

  perform 1
  from public.discord_skin_claim_economy_settings as economy
  where economy.guild_id = p_guild_id
  for share;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;

  for v_user_id in
    select drops.owner_discord_user_id
    from public.discord_skin_claim_drops as drops
    where drops.guild_id = p_guild_id
      and drops.status = 'claimed'
      and drops.owner_discord_user_id is not null
    group by drops.owner_discord_user_id
    having count(*) > 10
    union
    select upkeep.discord_user_id
    from public.discord_skin_claim_collection_upkeep as upkeep
    where upkeep.guild_id = p_guild_id
  loop
    insert into public.discord_skin_claim_collection_upkeep (guild_id, discord_user_id)
    values (p_guild_id, v_user_id)
    on conflict (guild_id, discord_user_id) do nothing;

    select * into v_state
    from public.discord_skin_claim_collection_upkeep as upkeep
    where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id
    for update;

    perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, v_user_id);
    perform 1
    from public.discord_skin_claim_drops as drops
    where drops.guild_id = p_guild_id
      and drops.owner_discord_user_id = v_user_id
      and drops.status = 'claimed'
    for update;

    select count(*)::integer into v_owned_count
    from public.discord_skin_claim_drops as drops
    where drops.guild_id = p_guild_id
      and drops.owner_discord_user_id = v_user_id
      and drops.status = 'claimed';
    if v_owned_count <= 10 then
      delete from public.discord_skin_claim_collection_upkeep as upkeep
      where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id;
      continue;
    end if;

    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (p_guild_id, v_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    insert into public.discord_skin_claim_collection_upkeep_allocations (guild_id, discord_user_id)
    values (p_guild_id, v_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    select allocations.balance into v_allocation
    from public.discord_skin_claim_collection_upkeep_allocations as allocations
    where allocations.guild_id = p_guild_id and allocations.discord_user_id = v_user_id
    for update;
    select balances.balance into v_balance
    from public.discord_knowbucks_balances as balances
    where balances.guild_id = p_guild_id and balances.discord_user_id = v_user_id
    for update;

    if v_state.grace_expires_at is not null then
      if v_state.grace_expires_at > now() then
        return query select v_user_id, 'grace-pending'::text, v_state.outstanding_amount, 0, v_state.grace_expires_at;
        continue;
      end if;

      if v_allocation + v_balance >= v_state.outstanding_amount then
        v_allocation_used := least(v_allocation, v_state.outstanding_amount);
        v_balance_used := v_state.outstanding_amount - v_allocation_used;
        if v_allocation_used > 0 then
          v_allocation := v_allocation - v_allocation_used;
          update public.discord_skin_claim_collection_upkeep_allocations as allocations
          set balance = v_allocation, updated_at = now()
          where allocations.guild_id = p_guild_id and allocations.discord_user_id = v_user_id;
          insert into public.discord_skin_claim_collection_upkeep_allocation_transactions (
            guild_id, discord_user_id, amount, balance_after, source
          ) values (
            p_guild_id, v_user_id, -v_allocation_used, v_allocation, 'upkeep'
          );
        end if;
        if v_balance_used > 0 then
          v_balance := v_balance - v_balance_used;
          update public.discord_knowbucks_balances as balances
          set balance = v_balance, updated_at = now()
          where balances.guild_id = p_guild_id and balances.discord_user_id = v_user_id;
          insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
          values (p_guild_id, v_user_id, -v_balance_used, v_balance, 'collection_upkeep');
        end if;
        update public.discord_skin_claim_collection_upkeep as upkeep
        set grace_expires_at = null,
            outstanding_amount = 0,
            last_assessed_on = v_today,
            updated_at = now()
        where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id;
        return query select v_user_id, 'paid-after-grace'::text, v_state.outstanding_amount, 0, null::timestamptz;
        continue;
      end if;

      with release_candidates as (
        select drops.id
        from public.discord_skin_claim_drops as drops
        where drops.guild_id = p_guild_id
          and drops.owner_discord_user_id = v_user_id
          and drops.status = 'claimed'
        order by drops.collection_order asc nulls last, drops.owner_acquired_at desc nulls last, drops.id desc
        offset 10
      )
      delete from public.discord_skin_claim_drops as drops
      using release_candidates
      where drops.id = release_candidates.id;
      get diagnostics v_released_count = row_count;
      delete from public.discord_skin_claim_collection_upkeep as upkeep
      where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id;
      return query select v_user_id, 'released'::text, v_state.outstanding_amount, v_released_count, null::timestamptz;
      continue;
    end if;

    if v_state.last_assessed_on = v_today then
      continue;
    end if;

    select skills.lucky_level into v_lucky_level
    from public.get_discord_collection_fishing_skill_levels(p_guild_id, v_user_id) as skills;
    v_amount := ceil((
      (
        greatest(least(v_owned_count, 20) - 10, 0) * 100
        + greatest(least(v_owned_count, 30) - 20, 0) * 500
        + greatest(least(v_owned_count, 40) - 30, 0) * 1000
        + greatest(v_owned_count - 40, 0) * 2500
      )::numeric
      * greatest(0::numeric, 1 - (coalesce(v_lucky_level, 0)::numeric * 0.05))
    ))::bigint;

    if v_allocation + v_balance >= v_amount then
      v_allocation_used := least(v_allocation, v_amount);
      v_balance_used := v_amount - v_allocation_used;
      if v_allocation_used > 0 then
        v_allocation := v_allocation - v_allocation_used;
        update public.discord_skin_claim_collection_upkeep_allocations as allocations
        set balance = v_allocation, updated_at = now()
        where allocations.guild_id = p_guild_id and allocations.discord_user_id = v_user_id;
        insert into public.discord_skin_claim_collection_upkeep_allocation_transactions (
          guild_id, discord_user_id, amount, balance_after, source
        ) values (
          p_guild_id, v_user_id, -v_allocation_used, v_allocation, 'upkeep'
        );
      end if;
      if v_balance_used > 0 then
        v_balance := v_balance - v_balance_used;
        update public.discord_knowbucks_balances as balances
        set balance = v_balance, updated_at = now()
        where balances.guild_id = p_guild_id and balances.discord_user_id = v_user_id;
        insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
        values (p_guild_id, v_user_id, -v_balance_used, v_balance, 'collection_upkeep');
      end if;
      update public.discord_skin_claim_collection_upkeep as upkeep
      set last_assessed_on = v_today,
          updated_at = now()
      where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id;
      return query select v_user_id, 'charged'::text, v_amount, 0, null::timestamptz;
      continue;
    end if;

    update public.discord_skin_claim_collection_upkeep as upkeep
    set last_assessed_on = v_today,
        grace_expires_at = now() + interval '1 day',
        outstanding_amount = v_amount,
        updated_at = now()
    where upkeep.guild_id = p_guild_id and upkeep.discord_user_id = v_user_id;
    return query select v_user_id, 'grace-opened'::text, v_amount, 0, now() + interval '1 day';
  end loop;
end;
$$;

revoke all on function public.process_discord_skin_collection_upkeep(text) from public;
grant execute on function public.process_discord_skin_collection_upkeep(text) to service_role;

notify pgrst, 'reload schema';

commit;
