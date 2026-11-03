begin;

-- Preserve historical surprise receipts while allowing the revised reward
-- ladder to use explicit source types for the newly introduced amounts.
alter table public.discord_knowbucks_message_rewards
  drop constraint if exists discord_knowbucks_message_rewards_reward_type_check;

alter table public.discord_knowbucks_message_rewards
  add constraint discord_knowbucks_message_rewards_reward_type_check
  check (reward_type in (
    'message_lottery_1000',
    'message_lottery_2500',
    'message_lottery_5000',
    'message_lottery_10000',
    'message_lottery_25000',
    'message_lottery_50000',
    'message_lottery_250000',
    'message_lottery_1000000',
    'disboard_bump'
  ));

alter table public.discord_knowbucks_message_rewards
  drop constraint if exists discord_knowbucks_message_rewards_amount_check;

alter table public.discord_knowbucks_message_rewards
  add constraint discord_knowbucks_message_rewards_amount_check
  check (amount in (1000, 2500, 5000, 10000, 25000, 50000, 250000, 1000000));

create or replace function public.award_discord_knowbucks_message_reward(
  p_guild_id text,
  p_discord_user_id text,
  p_source_message_id text,
  p_reward_type text
)
returns table (awarded boolean, award_amount bigint, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_amount bigint;
  v_previous_balance bigint;
  v_current_balance bigint;
  v_source text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_source_message_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, user, and message identifiers must be valid snowflakes.';
  end if;

  v_award_amount := case p_reward_type
    when 'message_lottery_1000' then 1000
    when 'message_lottery_2500' then 2500
    when 'message_lottery_5000' then 5000
    when 'message_lottery_10000' then 10000
    when 'message_lottery_25000' then 25000
    when 'message_lottery_50000' then 50000
    when 'message_lottery_250000' then 250000
    when 'message_lottery_1000000' then 1000000
    when 'disboard_bump' then 2500
    else null
  end;
  if v_award_amount is null then
    raise exception 'Unsupported Discord message reward type.';
  end if;
  v_source := case when p_reward_type = 'disboard_bump' then 'disboard_bump' else 'message_lottery' end;

  insert into public.discord_knowbucks_message_rewards (
    guild_id, source_message_id, discord_user_id, reward_type, amount
  ) values (
    p_guild_id, p_source_message_id, p_discord_user_id, p_reward_type, v_award_amount
  )
  on conflict (guild_id, source_message_id) do nothing;

  if not found then
    return query select false, 0::bigint, null::bigint;
    return;
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balance into v_previous_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  v_current_balance := v_previous_balance + v_award_amount;
  update public.discord_knowbucks_balances
  set balance = v_current_balance,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source
  ) values (
    p_guild_id, p_discord_user_id, v_award_amount, v_current_balance, v_source
  );

  return query select true, v_award_amount, v_current_balance;
end;
$$;

-- Fishing notification preferences are server-only Discord settings. Existing
-- players keep the established opt-in behavior until they choose otherwise.
alter table public.discord_fishing_players
  add column if not exists expedition_pings_enabled boolean not null default true;

create or replace function public.set_discord_fishing_expedition_pings(
  p_guild_id text,
  p_discord_user_id text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_enabled is null then
    raise exception 'Fishing ping preference must be true or false.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);

  update public.discord_fishing_players
  set expedition_pings_enabled = p_enabled,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  return p_enabled;
end;
$$;

revoke all on function public.award_discord_knowbucks_message_reward(text, text, text, text) from public;
revoke all on function public.set_discord_fishing_expedition_pings(text, text, boolean) from public;
grant execute on function public.award_discord_knowbucks_message_reward(text, text, text, text) to service_role;
grant execute on function public.set_discord_fishing_expedition_pings(text, text, boolean) to service_role;

notify pgrst, 'reload schema';

commit;
