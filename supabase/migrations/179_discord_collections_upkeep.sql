begin;

-- Collection upkeep is a first-class KnowBucks ledger event. Keeping it in
-- the same constrained source list as the other economy actions preserves
-- auditability without granting browser clients direct table access.
alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_force', 'collection_summon_refund',
    'collection_capacity_add', 'collection_sell', 'collection_steal', 'collection_upkeep',
    'fishing_expedition', 'fishing_shop_purchase', 'fishing_chest_open',
    'fishing_crate_open', 'fishing_level_up', 'coinflip_win', 'coinflip_loss',
    'snipe', 'message_lottery', 'disboard_bump'
  ));

-- The first ten claimed skins remain free regardless of capacity. Staff can
-- tune the daily amount applied to every currently owned skin above that
-- threshold; the initial value is deliberately modest and visible in the
-- Collections configuration screen.
alter table public.discord_skin_claim_economy_settings
  add column if not exists collection_upkeep_daily_cost_per_excess_skin bigint not null default 100
    check (collection_upkeep_daily_cost_per_excess_skin between 1 and 1000000000);

-- One row serializes a member's daily assessment and one-day grace period.
-- It stores the amount calculated at the failed assessment so later Fishing
-- skill or configuration changes never re-price an already-open grace period.
create table if not exists public.discord_skin_claim_collection_upkeep (
  guild_id text not null references public.discord_skin_claim_economy_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  last_assessed_on date,
  grace_expires_at timestamptz,
  outstanding_amount bigint not null default 0 check (outstanding_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id),
  check (
    (grace_expires_at is null and outstanding_amount = 0)
    or (grace_expires_at is not null and outstanding_amount > 0)
  )
);

create index if not exists discord_skin_claim_collection_upkeep_grace_idx
  on public.discord_skin_claim_collection_upkeep (guild_id, grace_expires_at asc)
  where grace_expires_at is not null;

alter table public.discord_skin_claim_collection_upkeep enable row level security;
revoke all on table public.discord_skin_claim_collection_upkeep from anon, authenticated;
grant select, insert, update, delete on table public.discord_skin_claim_collection_upkeep to service_role;

create or replace function public.replace_discord_skin_claim_upkeep_settings(
  p_guild_id text,
  p_daily_cost_per_excess_skin bigint,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_daily_cost_per_excess_skin not between 1 and 1000000000 then
    raise exception 'Collection daily upkeep settings are outside their supported ranges.';
  end if;

  update public.discord_skin_claim_economy_settings
  set collection_upkeep_daily_cost_per_excess_skin = p_daily_cost_per_excess_skin,
      updated_by = p_updated_by,
      updated_at = now()
  where guild_id = p_guild_id;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;
end;
$$;

-- Called only by the bot's once-per-day reconciliation. It locks the member's
-- upkeep row, capacity row, owned skins, and balance before determining the
-- amount, so simultaneous claim, transfer, sell, or balance activity cannot
-- charge twice or release the wrong collection entries.
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
declare
  v_daily_cost_per_excess_skin bigint;
  v_user_id text;
  v_state public.discord_skin_claim_collection_upkeep%rowtype;
  v_owned_count integer;
  v_excess_count integer;
  v_lucky_level integer;
  v_amount bigint;
  v_balance bigint;
  v_released_count integer;
  v_today date := (now() at time zone 'UTC')::date;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;

  select economy.collection_upkeep_daily_cost_per_excess_skin
  into v_daily_cost_per_excess_skin
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
      delete from public.discord_skin_claim_collection_upkeep
      where guild_id = p_guild_id and discord_user_id = v_user_id;
      continue;
    end if;

    if v_state.grace_expires_at is not null then
      if v_state.grace_expires_at > now() then
        return query select v_user_id, 'grace-pending'::text, v_state.outstanding_amount, 0, v_state.grace_expires_at;
        continue;
      end if;

      insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
      values (p_guild_id, v_user_id)
      on conflict (guild_id, discord_user_id) do nothing;
      select balances.balance into v_balance
      from public.discord_knowbucks_balances as balances
      where balances.guild_id = p_guild_id and balances.discord_user_id = v_user_id
      for update;

      if v_balance >= v_state.outstanding_amount then
        v_balance := v_balance - v_state.outstanding_amount;
        update public.discord_knowbucks_balances
        set balance = v_balance, updated_at = now()
        where guild_id = p_guild_id and discord_user_id = v_user_id;
        insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
        values (p_guild_id, v_user_id, -v_state.outstanding_amount, v_balance, 'collection_upkeep');
        update public.discord_skin_claim_collection_upkeep
        set grace_expires_at = null,
            outstanding_amount = 0,
            last_assessed_on = v_today,
            updated_at = now()
        where guild_id = p_guild_id and discord_user_id = v_user_id;
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
      delete from public.discord_skin_claim_collection_upkeep
      where guild_id = p_guild_id and discord_user_id = v_user_id;
      return query select v_user_id, 'released'::text, v_state.outstanding_amount, v_released_count, null::timestamptz;
      continue;
    end if;

    if v_state.last_assessed_on = v_today then
      continue;
    end if;

    v_excess_count := v_owned_count - 10;
    select skills.lucky_level into v_lucky_level
    from public.get_discord_collection_fishing_skill_levels(p_guild_id, v_user_id) as skills;
    v_amount := ceil(
      (v_daily_cost_per_excess_skin * v_excess_count)::numeric
      * greatest(0::numeric, 1 - (coalesce(v_lucky_level, 0)::numeric * 0.05))
    )::bigint;

    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (p_guild_id, v_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    select balances.balance into v_balance
    from public.discord_knowbucks_balances as balances
    where balances.guild_id = p_guild_id and balances.discord_user_id = v_user_id
    for update;

    if v_balance >= v_amount then
      v_balance := v_balance - v_amount;
      update public.discord_knowbucks_balances
      set balance = v_balance, updated_at = now()
      where guild_id = p_guild_id and discord_user_id = v_user_id;
      insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
      values (p_guild_id, v_user_id, -v_amount, v_balance, 'collection_upkeep');
      update public.discord_skin_claim_collection_upkeep
      set last_assessed_on = v_today,
          updated_at = now()
      where guild_id = p_guild_id and discord_user_id = v_user_id;
      return query select v_user_id, 'charged'::text, v_amount, 0, null::timestamptz;
      continue;
    end if;

    update public.discord_skin_claim_collection_upkeep
    set last_assessed_on = v_today,
        grace_expires_at = now() + interval '1 day',
        outstanding_amount = v_amount,
        updated_at = now()
    where guild_id = p_guild_id and discord_user_id = v_user_id;
    return query select v_user_id, 'grace-opened'::text, v_amount, 0, now() + interval '1 day';
  end loop;
end;
$$;

-- Release lifecycle cleanup must remove an unresolved upkeep status as well as
-- the member's claimed items, capacity, and action cooldowns.
create or replace function public.clear_discord_skin_collection(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord user identifier must be valid.';
  end if;
  delete from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and (
      (drops.status = 'claimed' and drops.owner_discord_user_id = p_discord_user_id)
      or (drops.status = 'pending' and drops.claim_grace_discord_user_id = p_discord_user_id)
    );
  delete from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  delete from public.discord_skin_claim_collection_upkeep
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  delete from public.discord_skin_claim_steal_cooldowns
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  delete from public.discord_skin_claim_summon_cooldowns
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
end;
$$;

create or replace function public.clear_discord_skin_collection_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.discord_user_id is not null then
    delete from public.discord_skin_claim_drops as drops
    where (drops.status = 'claimed' and drops.owner_discord_user_id = old.discord_user_id)
      or (drops.status = 'pending' and drops.claim_grace_discord_user_id = old.discord_user_id);
    delete from public.discord_skin_claim_collection_capacities
    where discord_user_id = old.discord_user_id;
    delete from public.discord_skin_claim_collection_upkeep
    where discord_user_id = old.discord_user_id;
    delete from public.discord_skin_claim_steal_cooldowns
    where discord_user_id = old.discord_user_id;
    delete from public.discord_skin_claim_summon_cooldowns
    where discord_user_id = old.discord_user_id;
  end if;
  return old;
end;
$$;

revoke all on function public.replace_discord_skin_claim_upkeep_settings(text, bigint, uuid) from public;
revoke all on function public.process_discord_skin_collection_upkeep(text) from public;
revoke all on function public.clear_discord_skin_collection(text, text) from public;
revoke all on function public.clear_discord_skin_collection_on_profile_delete() from public;

grant execute on function public.replace_discord_skin_claim_upkeep_settings(text, bigint, uuid) to service_role;
grant execute on function public.process_discord_skin_collection_upkeep(text) to service_role;
grant execute on function public.clear_discord_skin_collection(text, text) to service_role;

notify pgrst, 'reload schema';

commit;
