begin;

-- Keep the original four-argument settlement routine intact for already
-- deployed callers, and expose a five-argument wrapper for snapshot-based
-- role and weekday bonuses. The wrapper runs in the same transaction as the
-- base settlement, so Fishing level-up KnowBucks cannot be added twice.
create function public.settle_discord_fishing_expedition(
  p_expedition_id bigint,
  p_result jsonb,
  p_knowbucks_awarded bigint,
  p_special_items jsonb,
  p_fishing_level_knowbucks_multiplier_basis_points integer
)
returns table (
  settled boolean,
  guild_id text,
  discord_user_id text,
  notification_channel_id text,
  result jsonb,
  knowbucks_awarded bigint,
  current_balance bigint,
  awarded_gear_item_ids jsonb,
  fishing_xp_awarded bigint,
  fishing_previous_level integer,
  fishing_current_level integer,
  fishing_total_xp bigint,
  fishing_knowbucks_awarded bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement record;
  v_level_bonus bigint := 0;
  v_balance bigint;
begin
  if p_fishing_level_knowbucks_multiplier_basis_points not between 10000 and 22000 then
    raise exception 'Fishing level-up KnowBucks multiplier is invalid.';
  end if;

  select * into v_settlement
  from public.settle_discord_fishing_expedition(
    p_expedition_id,
    p_result,
    p_knowbucks_awarded,
    p_special_items
  );

  if not coalesce(v_settlement.settled, false) then
    return query select
      coalesce(v_settlement.settled, false),
      v_settlement.guild_id,
      v_settlement.discord_user_id,
      v_settlement.notification_channel_id,
      v_settlement.result,
      coalesce(v_settlement.knowbucks_awarded, 0)::bigint,
      v_settlement.current_balance,
      coalesce(v_settlement.awarded_gear_item_ids, '[]'::jsonb),
      coalesce(v_settlement.fishing_xp_awarded, 0)::bigint,
      v_settlement.fishing_previous_level,
      v_settlement.fishing_current_level,
      v_settlement.fishing_total_xp,
      coalesce(v_settlement.fishing_knowbucks_awarded, 0)::bigint;
    return;
  end if;

  v_level_bonus := floor(
    v_settlement.fishing_knowbucks_awarded
    * (p_fishing_level_knowbucks_multiplier_basis_points - 10000)
    / 10000.0
  )::bigint;

  if v_level_bonus > 0 then
    select balances.balance into v_balance
    from public.discord_knowbucks_balances as balances
    where balances.guild_id = v_settlement.guild_id
      and balances.discord_user_id = v_settlement.discord_user_id
    for update;
    if not found then
      raise exception 'Fishing KnowBucks balance is unavailable.';
    end if;

    v_balance := v_balance + v_level_bonus;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance,
        updated_at = now()
    where balances.guild_id = v_settlement.guild_id
      and balances.discord_user_id = v_settlement.discord_user_id;

    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source, level_from, level_to
    ) values (
      v_settlement.guild_id,
      v_settlement.discord_user_id,
      v_level_bonus,
      v_balance,
      'fishing_level_up',
      v_settlement.fishing_previous_level,
      v_settlement.fishing_current_level
    );
  end if;

  return query select
    true,
    v_settlement.guild_id,
    v_settlement.discord_user_id,
    v_settlement.notification_channel_id,
    v_settlement.result,
    v_settlement.knowbucks_awarded,
    coalesce(v_balance, v_settlement.current_balance),
    v_settlement.awarded_gear_item_ids,
    v_settlement.fishing_xp_awarded,
    v_settlement.fishing_previous_level,
    v_settlement.fishing_current_level,
    v_settlement.fishing_total_xp,
    v_settlement.fishing_knowbucks_awarded + v_level_bonus;
end;
$$;

revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb, integer) from public;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb, integer) to service_role;

notify pgrst, 'reload schema';

commit;
