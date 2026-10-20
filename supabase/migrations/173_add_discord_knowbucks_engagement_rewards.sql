begin;

-- Keep every new economy path independently auditable. These sources are
-- written only by the bounded RPCs below, never by a browser client.
alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add',
    'collection_sell', 'collection_steal', 'fishing_expedition',
    'fishing_shop_purchase', 'fishing_chest_open', 'fishing_crate_open',
    'fishing_level_up', 'coinflip_win', 'coinflip_loss', 'snipe',
    'message_lottery', 'disboard_bump'
  ));

-- The Discord gateway can reconnect and redeliver an event. Store only
-- successful reward receipts so every source message can mint currency once,
-- even after a reconnect or a process restart. Message content is never stored.
create table if not exists public.discord_knowbucks_message_rewards (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  source_message_id text not null check (source_message_id ~ '^[0-9]{17,20}$'),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  reward_type text not null check (reward_type in (
    'message_lottery_1000',
    'message_lottery_2500',
    'message_lottery_5000',
    'message_lottery_10000',
    'message_lottery_25000',
    'disboard_bump'
  )),
  amount bigint not null check (amount in (1000, 2500, 5000, 10000, 25000)),
  created_at timestamptz not null default now(),
  primary key (guild_id, source_message_id)
);

alter table public.discord_knowbucks_message_rewards enable row level security;
revoke all on table public.discord_knowbucks_message_rewards from anon, authenticated;
grant select, insert on table public.discord_knowbucks_message_rewards to service_role;

create or replace function public.flip_discord_knowbucks(
  p_guild_id text,
  p_discord_user_id text,
  p_amount bigint,
  p_won boolean
)
returns table (won boolean, wager_amount bigint, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_balance bigint;
  v_current_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_amount not between 1 and 1000000000 then
    raise exception 'Coinflip wagers must be between 1 and 1,000,000,000 KnowBucks.';
  end if;
  if p_won is null then
    raise exception 'Coinflip outcome is required.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balance into v_previous_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  if v_previous_balance < p_amount then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  v_current_balance := v_previous_balance + case when p_won then p_amount else -p_amount end;

  update public.discord_knowbucks_balances
  set balance = v_current_balance,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source
  ) values (
    p_guild_id,
    p_discord_user_id,
    v_current_balance - v_previous_balance,
    v_current_balance,
    case when p_won then 'coinflip_win' else 'coinflip_loss' end
  );

  return query select p_won, p_amount, v_current_balance;
end;
$$;

create or replace function public.purchase_discord_snipe(
  p_guild_id text,
  p_discord_user_id text
)
returns table (current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_balance bigint;
  v_current_balance bigint;
  v_cost constant bigint := 1000;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balance into v_previous_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  if v_previous_balance < v_cost then
    raise exception 'Insufficient KnowBucks balance for /snipe.';
  end if;

  v_current_balance := v_previous_balance - v_cost;
  update public.discord_knowbucks_balances
  set balance = v_current_balance,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source
  ) values (
    p_guild_id, p_discord_user_id, -v_cost, v_current_balance, 'snipe'
  );

  return query select v_current_balance;
end;
$$;

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

revoke all on function public.flip_discord_knowbucks(text, text, bigint, boolean) from public;
revoke all on function public.purchase_discord_snipe(text, text) from public;
revoke all on function public.award_discord_knowbucks_message_reward(text, text, text, text) from public;
grant execute on function public.flip_discord_knowbucks(text, text, bigint, boolean) to service_role;
grant execute on function public.purchase_discord_snipe(text, text) to service_role;
grant execute on function public.award_discord_knowbucks_message_reward(text, text, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
