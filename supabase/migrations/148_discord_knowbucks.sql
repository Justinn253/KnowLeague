begin;

create table if not exists public.discord_knowbucks_balances (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

create table if not exists public.discord_knowbucks_transactions (
  id bigint generated always as identity primary key,
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  source text not null check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent'
  )),
  related_discord_user_id text check (related_discord_user_id is null or related_discord_user_id ~ '^[0-9]{17,20}$'),
  level_from integer check (level_from is null or level_from between 0 and 10000),
  level_to integer check (level_to is null or level_to between 0 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists discord_knowbucks_transactions_guild_user_created_idx
  on public.discord_knowbucks_transactions(guild_id, discord_user_id, created_at desc, id desc);

alter table public.discord_knowbucks_balances enable row level security;
alter table public.discord_knowbucks_transactions enable row level security;
revoke all on table public.discord_knowbucks_balances from anon, authenticated;
revoke all on table public.discord_knowbucks_transactions from anon, authenticated;
grant select, insert, update, delete on table public.discord_knowbucks_balances to service_role;
grant select, insert on table public.discord_knowbucks_transactions to service_role;

create or replace function public.award_discord_level_knowbucks(
  p_guild_id text,
  p_discord_user_id text,
  p_previous_level integer,
  p_current_level integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award bigint;
  v_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_previous_level not between 0 and 10000 or p_current_level not between 0 and 10000 then
    raise exception 'Discord levels must be between 0 and 10000.';
  end if;
  if p_current_level <= p_previous_level then
    return 0;
  end if;

  v_award := 500::bigint * (
    p_current_level::bigint * (p_current_level + 1)
    - p_previous_level::bigint * (p_previous_level + 1)
  );

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balance into v_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  v_balance := v_balance + v_award;
  update public.discord_knowbucks_balances
  set balance = v_balance,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source, level_from, level_to
  ) values (
    p_guild_id, p_discord_user_id, v_award, v_balance, 'level_up', p_previous_level, p_current_level
  );

  return v_award;
end;
$$;

drop function if exists public.award_discord_chat_xp(text, text);

create function public.award_discord_chat_xp(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  awarded boolean,
  previous_level integer,
  current_level integer,
  total_xp bigint,
  knowbucks_awarded bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.discord_leveling_settings%rowtype;
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
  v_current_level integer;
  v_knowbucks_awarded bigint := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select * into v_settings
  from public.discord_leveling_settings
  where guild_id = p_guild_id
  for share;
  if not found or not v_settings.enabled then
    return query select false, 0, 0, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select * into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  if v_member.last_xp_awarded_at is not null
    and v_member.last_xp_awarded_at > now() - make_interval(secs => v_settings.cooldown_seconds) then
    return query select false, v_member.level, v_member.level, v_member.total_xp, 0::bigint;
    return;
  end if;

  v_total_xp := v_member.total_xp + v_settings.xp_per_message;
  v_current_level := public.discord_level_for_total_xp(v_total_xp);
  update public.discord_leveling_members
  set total_xp = v_total_xp,
      level = v_current_level,
      last_xp_awarded_at = now(),
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  v_knowbucks_awarded := public.award_discord_level_knowbucks(
    p_guild_id, p_discord_user_id, v_member.level, v_current_level
  );
  return query select true, v_member.level, v_current_level, v_total_xp, v_knowbucks_awarded;
end;
$$;

drop function if exists public.award_discord_voice_xp(text, text);

create function public.award_discord_voice_xp(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  awarded boolean,
  xp_awarded integer,
  previous_level integer,
  current_level integer,
  total_xp bigint,
  knowbucks_awarded bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_joined_at timestamptz;
  v_minutes integer;
  v_settings public.discord_leveling_settings%rowtype;
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
  v_current_level integer;
  v_knowbucks_awarded bigint := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select joined_at into v_joined_at
  from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;
  if not found then
    return query select false, 0, 0, 0, 0::bigint, 0::bigint;
    return;
  end if;

  delete from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  v_minutes := floor(greatest(0, extract(epoch from now() - v_joined_at)) / 60)::integer;
  if v_minutes < 1 then
    return query select false, 0, 0, 0, 0::bigint, 0::bigint;
    return;
  end if;

  select * into v_settings
  from public.discord_leveling_settings
  where guild_id = p_guild_id
  for share;
  if not found or not v_settings.enabled then
    return query select false, 0, 0, 0, 0::bigint, 0::bigint;
    return;
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select * into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  v_total_xp := v_member.total_xp + v_minutes;
  v_current_level := public.discord_level_for_total_xp(v_total_xp);
  update public.discord_leveling_members
  set total_xp = v_total_xp,
      level = v_current_level,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  v_knowbucks_awarded := public.award_discord_level_knowbucks(
    p_guild_id, p_discord_user_id, v_member.level, v_current_level
  );
  return query select true, v_minutes, v_member.level, v_current_level, v_total_xp, v_knowbucks_awarded;
end;
$$;

create or replace function public.update_discord_knowbucks(
  p_guild_id text,
  p_discord_user_id text,
  p_operation text,
  p_amount bigint
)
returns table (previous_balance bigint, current_balance bigint, applied_amount bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_balance bigint;
  v_current_balance bigint;
  v_source text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_operation not in ('add', 'remove', 'set') then
    raise exception 'KnowBucks operation must be add, remove, or set.';
  end if;
  if p_amount < 0 or p_amount > 1000000000 then
    raise exception 'KnowBucks amounts must be between 0 and 1,000,000,000.';
  end if;
  if p_operation in ('add', 'remove') and p_amount = 0 then
    raise exception 'KnowBucks add and remove amounts must be at least 1.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balance into v_previous_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  v_current_balance := case p_operation
    when 'add' then v_previous_balance + p_amount
    when 'remove' then greatest(0::bigint, v_previous_balance - p_amount)
    else p_amount
  end;
  v_source := case p_operation
    when 'add' then 'admin_add'
    when 'remove' then 'admin_remove'
    else 'admin_set'
  end;

  if v_current_balance <> v_previous_balance then
    update public.discord_knowbucks_balances
    set balance = v_current_balance,
        updated_at = now()
    where guild_id = p_guild_id
      and discord_user_id = p_discord_user_id;

    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source
    ) values (
      p_guild_id, p_discord_user_id, v_current_balance - v_previous_balance, v_current_balance, v_source
    );
  end if;

  return query select v_previous_balance, v_current_balance, v_current_balance - v_previous_balance;
end;
$$;

create or replace function public.pay_discord_knowbucks(
  p_guild_id text,
  p_sender_discord_user_id text,
  p_recipient_discord_user_id text,
  p_amount bigint
)
returns table (sender_balance bigint, recipient_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_balance bigint;
  v_recipient_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_sender_discord_user_id !~ '^[0-9]{17,20}$'
    or p_recipient_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_sender_discord_user_id = p_recipient_discord_user_id then
    raise exception 'KnowBucks cannot be paid to the same account.';
  end if;
  if p_amount not between 1 and 1000000000 then
    raise exception 'KnowBucks payments must be between 1 and 1,000,000,000.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_sender_discord_user_id), (p_guild_id, p_recipient_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  perform 1
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id in (p_sender_discord_user_id, p_recipient_discord_user_id)
  order by discord_user_id
  for update;

  select balance into v_sender_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_sender_discord_user_id;
  if v_sender_balance < p_amount then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  select balance into v_recipient_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id
    and discord_user_id = p_recipient_discord_user_id;
  v_sender_balance := v_sender_balance - p_amount;
  v_recipient_balance := v_recipient_balance + p_amount;

  update public.discord_knowbucks_balances
  set balance = case
    when discord_user_id = p_sender_discord_user_id then v_sender_balance
    else v_recipient_balance
  end,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id in (p_sender_discord_user_id, p_recipient_discord_user_id);

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source, related_discord_user_id
  ) values
    (p_guild_id, p_sender_discord_user_id, -p_amount, v_sender_balance, 'pay_sent', p_recipient_discord_user_id),
    (p_guild_id, p_recipient_discord_user_id, p_amount, v_recipient_balance, 'pay_received', p_sender_discord_user_id);

  return query select v_sender_balance, v_recipient_balance;
end;
$$;

revoke all on function public.award_discord_level_knowbucks(text, text, integer, integer) from public;
revoke all on function public.award_discord_chat_xp(text, text) from public;
revoke all on function public.award_discord_voice_xp(text, text) from public;
revoke all on function public.update_discord_knowbucks(text, text, text, bigint) from public;
revoke all on function public.pay_discord_knowbucks(text, text, text, bigint) from public;
grant execute on function public.award_discord_level_knowbucks(text, text, integer, integer) to service_role;
grant execute on function public.award_discord_chat_xp(text, text) to service_role;
grant execute on function public.award_discord_voice_xp(text, text) to service_role;
grant execute on function public.update_discord_knowbucks(text, text, text, bigint) to service_role;
grant execute on function public.pay_discord_knowbucks(text, text, text, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
