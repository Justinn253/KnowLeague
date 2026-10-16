begin;

alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add',
    'collection_sell', 'collection_steal'
  ));

create table if not exists public.discord_skin_claim_admin_roles (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create table if not exists public.discord_skin_claim_steal_cooldowns (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  available_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

-- Preserve existing staff access after separating collections administration
-- from XP and KnowBucks administration.
insert into public.discord_skin_claim_admin_roles (guild_id, discord_role_id)
select skin_settings.guild_id, staff_roles.discord_role_id
from public.discord_skin_claim_settings as skin_settings
join public.discord_leveling_staff_roles as staff_roles
  on staff_roles.guild_id = skin_settings.guild_id
on conflict (guild_id, discord_role_id) do nothing;

alter table public.discord_skin_claim_admin_roles enable row level security;
alter table public.discord_skin_claim_steal_cooldowns enable row level security;
revoke all on table public.discord_skin_claim_admin_roles from anon, authenticated;
revoke all on table public.discord_skin_claim_steal_cooldowns from anon, authenticated;
grant select, insert, update, delete on table public.discord_skin_claim_admin_roles to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_steal_cooldowns to service_role;

create or replace function public.replace_discord_skin_claim_admin_roles(
  p_guild_id text,
  p_role_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if coalesce(cardinality(p_role_ids), 0) > 25 then
    raise exception 'Provide up to twenty-five collection admin roles.';
  end if;
  if cardinality(p_role_ids) <> cardinality(array(select distinct unnest(p_role_ids))) then
    raise exception 'Each collection admin role can only be selected once.';
  end if;
  foreach v_role_id in array coalesce(p_role_ids, '{}'::text[])
  loop
    if v_role_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_roles as guild_roles
      where guild_roles.guild_id = p_guild_id and guild_roles.role_id = v_role_id
    ) then
      raise exception 'Every collection admin role must be currently synced from Discord.';
    end if;
  end loop;

  delete from public.discord_skin_claim_admin_roles
  where guild_id = p_guild_id;
  insert into public.discord_skin_claim_admin_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now()
  from unnest(coalesce(p_role_ids, '{}'::text[])) as role_id;
end;
$$;

create function public.replace_discord_collection_configuration(
  p_guild_id text,
  p_enabled boolean,
  p_xp_per_message integer,
  p_cooldown_seconds integer,
  p_level_up_message_enabled boolean,
  p_level_up_message_template text,
  p_level_up_message_channel_id text,
  p_leaderboard_top_role_id text,
  p_role_rewards jsonb,
  p_manual_xp_role_ids jsonb,
  p_leaderboard_excluded_role_ids jsonb,
  p_skin_claim_enabled boolean,
  p_skin_claim_minimum_interval_minutes integer,
  p_skin_claim_maximum_interval_minutes integer,
  p_skin_claim_window_minutes integer,
  p_skin_claim_all_channels boolean,
  p_skin_claim_eligible_channel_ids text[],
  p_skin_claim_rarity_weights jsonb,
  p_summon_base_cost bigint,
  p_default_collection_capacity integer,
  p_collection_capacity_upgrade_cost bigint,
  p_collection_steal_chance_percent integer,
  p_claim_grace_period_seconds integer,
  p_sell_values jsonb,
  p_collection_admin_role_ids text[],
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.replace_discord_collection_configuration(
    p_guild_id, p_enabled, p_xp_per_message, p_cooldown_seconds,
    p_level_up_message_enabled, p_level_up_message_template, p_level_up_message_channel_id,
    p_leaderboard_top_role_id, p_role_rewards, p_manual_xp_role_ids,
    p_leaderboard_excluded_role_ids, p_skin_claim_enabled,
    p_skin_claim_minimum_interval_minutes, p_skin_claim_maximum_interval_minutes,
    p_skin_claim_window_minutes, p_skin_claim_all_channels,
    p_skin_claim_eligible_channel_ids, p_skin_claim_rarity_weights,
    p_summon_base_cost, p_default_collection_capacity,
    p_collection_capacity_upgrade_cost, p_collection_steal_chance_percent,
    p_claim_grace_period_seconds, p_sell_values, p_updated_by
  );
  perform public.replace_discord_skin_claim_admin_roles(p_guild_id, p_collection_admin_role_ids);
end;
$$;

create or replace function public.transfer_discord_skin_claim(
  p_guild_id text,
  p_sender_discord_user_id text,
  p_recipient_discord_user_id text,
  p_skin_code integer
)
returns table (skin_name text, skin_code integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_capacity integer;
  v_owned_count integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_sender_discord_user_id !~ '^[0-9]{17,20}$'
    or p_recipient_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_sender_discord_user_id = p_recipient_discord_user_id then
    raise exception 'A skin cannot be transferred to the same member.';
  end if;
  if p_skin_code not between 1000 and 9999 then
    raise exception 'Skin IDs must be four digits.';
  end if;

  select drops.* into v_drop
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_sender_discord_user_id
    and drops.skin_code = p_skin_code
    and drops.status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_recipient_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_recipient_discord_user_id
    and drops.status = 'claimed';
  if v_owned_count >= v_capacity then
    raise exception 'The recipient collection is full.';
  end if;

  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_recipient_discord_user_id,
      owner_acquired_at = now(),
      ownership_method = 'transferred',
      is_favorite = false,
      transferred_at = now()
  where id = v_drop.id;
  return query select v_drop.skin_name, v_drop.skin_code;
end;
$$;

create or replace function public.sell_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer
)
returns table (skin_name text, amount bigint, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_amount bigint;
  v_balance bigint;
begin
  select drops.* into v_drop
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.skin_code = p_skin_code
    and drops.status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;
  select sell_values.amount into v_amount
  from public.discord_skin_claim_sell_values as sell_values
  where sell_values.guild_id = p_guild_id and sell_values.rarity = v_drop.rarity;
  if not found then
    raise exception 'A sell value is not configured for this skin rarity.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  v_balance := v_balance + v_amount;
  delete from public.discord_skin_claim_drops where id = v_drop.id;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, v_amount, v_balance, 'collection_sell');
  return query select v_drop.skin_name, v_amount, v_balance;
end;
$$;

-- PostgreSQL cannot alter a function's OUT-column tuple with CREATE OR REPLACE.
-- No database function depends on this bot-facing RPC, so recreate it with the
-- expanded response required to expose the charged cost and cooldown.
drop function if exists public.steal_discord_skin_claim(text, text, integer);

create function public.steal_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer
)
returns table (
  outcome text,
  skin_name text,
  previous_owner_discord_user_id text,
  cost bigint,
  remaining_balance bigint,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_capacity integer;
  v_owned_count integer;
  v_sell_amount bigint;
  v_cost bigint;
  v_balance bigint;
  v_available_at timestamptz;
  v_steal_chance_percent integer;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' or p_skin_code not between 1000 and 9999 then
    raise exception 'Discord user identifier and skin ID must be valid.';
  end if;

  select drops.* into v_drop
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.skin_code = p_skin_code
    and drops.status = 'claimed'
  for update;
  if not found then
    return query select 'missing'::text, null::text, null::text, null::bigint, null::bigint, null::timestamptz;
    return;
  end if;
  if v_drop.owner_discord_user_id = p_discord_user_id then
    return query select 'own'::text, v_drop.skin_name, v_drop.owner_discord_user_id, null::bigint, null::bigint, null::timestamptz;
    return;
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select 'full'::text, v_drop.skin_name, v_drop.owner_discord_user_id, null::bigint, null::bigint, null::timestamptz;
    return;
  end if;

  insert into public.discord_skin_claim_steal_cooldowns (guild_id, discord_user_id, available_at)
  values (p_guild_id, p_discord_user_id, now())
  on conflict (guild_id, discord_user_id) do nothing;
  select cooldowns.available_at into v_available_at
  from public.discord_skin_claim_steal_cooldowns as cooldowns
  where cooldowns.guild_id = p_guild_id and cooldowns.discord_user_id = p_discord_user_id
  for update;
  if v_available_at > now() then
    return query select 'cooldown'::text, v_drop.skin_name, v_drop.owner_discord_user_id, null::bigint, null::bigint, v_available_at;
    return;
  end if;

  select sell_values.amount into v_sell_amount
  from public.discord_skin_claim_sell_values as sell_values
  where sell_values.guild_id = p_guild_id and sell_values.rarity = v_drop.rarity;
  if not found then
    raise exception 'A sell value is not configured for this skin rarity.';
  end if;
  v_cost := v_sell_amount * 3;

  select economy.collection_steal_chance_percent into v_steal_chance_percent
  from public.discord_skin_claim_economy_settings as economy
  where economy.guild_id = p_guild_id;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  if v_balance < v_cost then
    return query select 'insufficient-funds'::text, v_drop.skin_name, v_drop.owner_discord_user_id, v_cost, v_balance, null::timestamptz;
    return;
  end if;

  v_balance := v_balance - v_cost;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source, related_discord_user_id
  ) values (
    p_guild_id, p_discord_user_id, -v_cost, v_balance, 'collection_steal', v_drop.owner_discord_user_id
  );
  v_available_at := now() + interval '30 minutes';
  update public.discord_skin_claim_steal_cooldowns
  set available_at = v_available_at, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;

  if random() * 100 >= v_steal_chance_percent then
    return query select 'failed'::text, v_drop.skin_name, v_drop.owner_discord_user_id, v_cost, v_balance, v_available_at;
    return;
  end if;
  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_discord_user_id,
      owner_acquired_at = now(),
      ownership_method = 'stolen',
      is_favorite = false
  where id = v_drop.id;
  return query select 'stolen'::text, v_drop.skin_name, v_drop.owner_discord_user_id, v_cost, v_balance, v_available_at;
end;
$$;

revoke all on function public.replace_discord_skin_claim_admin_roles(text, text[]) from public;
revoke all on function public.replace_discord_collection_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, bigint, integer, bigint, integer, integer, jsonb, text[], uuid) from public;
revoke all on function public.transfer_discord_skin_claim(text, text, text, integer) from public;
revoke all on function public.sell_discord_skin_claim(text, text, integer) from public;
revoke all on function public.steal_discord_skin_claim(text, text, integer) from public;
grant execute on function public.replace_discord_skin_claim_admin_roles(text, text[]) to service_role;
grant execute on function public.replace_discord_collection_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, bigint, integer, bigint, integer, integer, jsonb, text[], uuid) to service_role;
grant execute on function public.transfer_discord_skin_claim(text, text, text, integer) to service_role;
grant execute on function public.sell_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.steal_discord_skin_claim(text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
