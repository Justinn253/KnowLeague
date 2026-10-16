begin;

alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add', 'collection_sell'
  ));

create table if not exists public.discord_skin_claim_economy_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  summon_base_cost bigint not null default 5000 check (summon_base_cost between 1 and 1000000000),
  default_collection_capacity integer not null default 10 check (default_collection_capacity between 1 and 10000),
  collection_capacity_upgrade_cost bigint not null default 500 check (collection_capacity_upgrade_cost between 1 and 1000000000),
  collection_steal_chance_percent integer not null default 1 check (collection_steal_chance_percent between 0 and 100),
  claim_grace_period_seconds integer not null default 10 check (claim_grace_period_seconds between 0 and 600),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_skin_claim_sell_values (
  guild_id text not null references public.discord_skin_claim_economy_settings(guild_id) on delete cascade,
  rarity text not null check (rarity in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')),
  amount bigint not null check (amount between 1 and 1000000000),
  updated_at timestamptz not null default now(),
  primary key (guild_id, rarity)
);

create table if not exists public.discord_skin_claim_collection_capacities (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  extra_slots integer not null default 0 check (extra_slots between 0 and 99990),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

alter table public.discord_skin_claim_drops
  add column if not exists claim_grace_discord_user_id text check (claim_grace_discord_user_id is null or claim_grace_discord_user_id ~ '^[0-9]{17,20}$'),
  add column if not exists claim_grace_expires_at timestamptz,
  add column if not exists owner_acquired_at timestamptz,
  add column if not exists ownership_method text not null default 'claimed' check (ownership_method in ('claimed', 'stolen', 'transferred')),
  add column if not exists is_favorite boolean not null default false,
  add column if not exists purchase_discord_user_id text check (purchase_discord_user_id is null or purchase_discord_user_id ~ '^[0-9]{17,20}$'),
  add column if not exists purchase_knowbucks_amount bigint check (purchase_knowbucks_amount is null or purchase_knowbucks_amount between 1 and 1000000000);

update public.discord_skin_claim_drops
set owner_acquired_at = coalesce(transferred_at, claimed_at),
    ownership_method = case when transferred_at is null then 'claimed' else 'transferred' end
where status = 'claimed' and owner_acquired_at is null;

create unique index if not exists discord_skin_claim_one_favorite_idx
  on public.discord_skin_claim_drops(guild_id, owner_discord_user_id)
  where status = 'claimed' and is_favorite;

create index if not exists discord_skin_claim_owner_favorite_idx
  on public.discord_skin_claim_drops(guild_id, owner_discord_user_id, is_favorite desc, owner_acquired_at desc, id desc)
  where status = 'claimed';

insert into public.discord_skin_claim_economy_settings (guild_id)
select guild_id from public.discord_skin_claim_settings
on conflict (guild_id) do nothing;

-- Preserve existing collections that predate capacity limits. This never
-- removes an item; it records only the slots needed above the new default.
insert into public.discord_skin_claim_collection_capacities as capacities (guild_id, discord_user_id, extra_slots)
select drops.guild_id,
       drops.owner_discord_user_id,
       greatest(0, count(*)::integer - economy.default_collection_capacity)
from public.discord_skin_claim_drops as drops
join public.discord_skin_claim_economy_settings as economy using (guild_id)
where drops.status = 'claimed' and drops.owner_discord_user_id is not null
group by drops.guild_id, drops.owner_discord_user_id, economy.default_collection_capacity
on conflict (guild_id, discord_user_id) do update
set extra_slots = greatest(
  capacities.extra_slots,
  excluded.extra_slots
);

insert into public.discord_skin_claim_sell_values (guild_id, rarity, amount)
select settings.guild_id, defaults.rarity, defaults.amount
from public.discord_skin_claim_economy_settings as settings
cross join (values
  ('Common'::text, 100::bigint),
  ('Rare'::text, 500::bigint),
  ('Epic'::text, 1000::bigint),
  ('Legendary'::text, 2500::bigint),
  ('Mythic'::text, 5000::bigint),
  ('Ultimate'::text, 10000::bigint),
  ('Exalted'::text, 15000::bigint),
  ('Transcendent'::text, 30000::bigint)
) as defaults(rarity, amount)
on conflict (guild_id, rarity) do nothing;

alter table public.discord_skin_claim_economy_settings enable row level security;
alter table public.discord_skin_claim_sell_values enable row level security;
alter table public.discord_skin_claim_collection_capacities enable row level security;
revoke all on table public.discord_skin_claim_economy_settings from anon, authenticated;
revoke all on table public.discord_skin_claim_sell_values from anon, authenticated;
revoke all on table public.discord_skin_claim_collection_capacities from anon, authenticated;
grant select, insert, update, delete on table public.discord_skin_claim_economy_settings to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_sell_values to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_collection_capacities to service_role;

create or replace function public.replace_discord_skin_claim_economy_settings(
  p_guild_id text,
  p_summon_base_cost bigint,
  p_default_collection_capacity integer,
  p_collection_capacity_upgrade_cost bigint,
  p_collection_steal_chance_percent integer,
  p_claim_grace_period_seconds integer,
  p_sell_values jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rarity text;
  v_amount bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_summon_base_cost not between 1 and 1000000000
    or p_default_collection_capacity not between 1 and 10000
    or p_collection_capacity_upgrade_cost not between 1 and 1000000000
    or p_collection_steal_chance_percent not between 0 and 100
    or p_claim_grace_period_seconds not between 0 and 600 then
    raise exception 'Collection economy settings are outside their supported ranges.';
  end if;
  if jsonb_typeof(p_sell_values) <> 'array' or jsonb_array_length(p_sell_values) <> 8 then
    raise exception 'Provide one sell value for every supported skin rarity.';
  end if;
  for v_rarity, v_amount in
    select value->>'rarity', (value->>'amount')::bigint
    from jsonb_array_elements(p_sell_values)
  loop
    if v_rarity not in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')
      or v_amount not between 1 and 1000000000 then
      raise exception 'Skin sell values must use a supported rarity and an amount from 1 to 1,000,000,000.';
    end if;
  end loop;
  if (select count(distinct value->>'rarity') from jsonb_array_elements(p_sell_values)) <> 8 then
    raise exception 'Provide each supported skin rarity exactly once.';
  end if;

  insert into public.discord_skin_claim_economy_settings as current (
    guild_id, summon_base_cost, default_collection_capacity, collection_capacity_upgrade_cost,
    collection_steal_chance_percent, claim_grace_period_seconds, updated_by, updated_at
  ) values (
    p_guild_id, p_summon_base_cost, p_default_collection_capacity, p_collection_capacity_upgrade_cost,
    p_collection_steal_chance_percent, p_claim_grace_period_seconds, p_updated_by, now()
  ) on conflict (guild_id) do update
  set summon_base_cost = excluded.summon_base_cost,
      default_collection_capacity = excluded.default_collection_capacity,
      collection_capacity_upgrade_cost = excluded.collection_capacity_upgrade_cost,
      collection_steal_chance_percent = excluded.collection_steal_chance_percent,
      claim_grace_period_seconds = excluded.claim_grace_period_seconds,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_skin_claim_sell_values where guild_id = p_guild_id;
  insert into public.discord_skin_claim_sell_values (guild_id, rarity, amount, updated_at)
  select p_guild_id, value->>'rarity', (value->>'amount')::bigint, now()
  from jsonb_array_elements(p_sell_values);
end;
$$;

create or replace function public.replace_discord_collection_configuration(
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
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.replace_discord_configuration(
    p_guild_id, p_enabled, p_xp_per_message, p_cooldown_seconds,
    p_level_up_message_enabled, p_level_up_message_template, p_level_up_message_channel_id,
    p_leaderboard_top_role_id, p_role_rewards, p_manual_xp_role_ids,
    p_leaderboard_excluded_role_ids, p_skin_claim_enabled,
    p_skin_claim_minimum_interval_minutes, p_skin_claim_maximum_interval_minutes,
    p_skin_claim_window_minutes, p_skin_claim_all_channels,
    p_skin_claim_eligible_channel_ids, p_skin_claim_rarity_weights, p_updated_by
  );
  perform public.replace_discord_skin_claim_economy_settings(
    p_guild_id, p_summon_base_cost, p_default_collection_capacity,
    p_collection_capacity_upgrade_cost, p_collection_steal_chance_percent,
    p_claim_grace_period_seconds, p_sell_values, p_updated_by
  );
end;
$$;

create or replace function public.lock_discord_skin_claim_collection_capacity(
  p_guild_id text,
  p_discord_user_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_capacity integer;
  v_extra_slots integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select default_collection_capacity into v_default_capacity
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;

  insert into public.discord_skin_claim_collection_capacities (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select extra_slots into v_extra_slots
  from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;

  return v_default_capacity + v_extra_slots;
end;
$$;

create or replace function public.claim_discord_skin_drop(
  p_guild_id text,
  p_message_id text,
  p_discord_user_id text
)
returns table (
  claimed boolean,
  skin_code integer,
  skin_name text,
  champion_name text,
  rarity text,
  release_date date,
  skin_line text,
  image_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_capacity integer;
  v_owned_count integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_message_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, message, and user identifiers must be valid snowflakes.';
  end if;
  select * into v_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and message_id = p_message_id
  for update;
  if not found then
    return;
  end if;
  if v_drop.status <> 'pending' or v_drop.expires_at <= now() then
    if v_drop.status = 'pending' and v_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_drop.id;
    end if;
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
    return;
  end if;
  if v_drop.claim_grace_discord_user_id is not null
    and v_drop.claim_grace_expires_at > now()
    and v_drop.claim_grace_discord_user_id <> p_discord_user_id then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
    return;
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id and status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
    return;
  end if;

  update public.discord_skin_claim_drops
  set status = 'claimed',
      claimed_by_discord_user_id = p_discord_user_id,
      owner_discord_user_id = p_discord_user_id,
      claimed_at = now(),
      owner_acquired_at = now(),
      ownership_method = 'claimed',
      is_favorite = false,
      claim_grace_discord_user_id = null,
      claim_grace_expires_at = null
  where id = v_drop.id;
  return query select true, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
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
  select * into v_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_sender_discord_user_id
    and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_recipient_discord_user_id);
  select count(*) into v_owned_count
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_recipient_discord_user_id and status = 'claimed';
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

create or replace function public.abandon_discord_skin_claim_drop(
  p_guild_id text,
  p_drop_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_balance bigint;
begin
  select * into v_drop
  from public.discord_skin_claim_drops
  where id = p_drop_id and guild_id = p_guild_id and status = 'pending' and message_id is null
  for update;
  if not found then
    return;
  end if;
  if v_drop.purchase_discord_user_id is not null then
    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (p_guild_id, v_drop.purchase_discord_user_id)
    on conflict (guild_id, discord_user_id) do nothing;
    select balance into v_balance
    from public.discord_knowbucks_balances
    where guild_id = p_guild_id and discord_user_id = v_drop.purchase_discord_user_id
    for update;
    v_balance := v_balance + v_drop.purchase_knowbucks_amount;
    update public.discord_knowbucks_balances
    set balance = v_balance, updated_at = now()
    where guild_id = p_guild_id and discord_user_id = v_drop.purchase_discord_user_id;
    insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
    values (p_guild_id, v_drop.purchase_discord_user_id, v_drop.purchase_knowbucks_amount, v_balance, 'collection_summon_refund');
  end if;
  update public.discord_skin_claim_drops set status = 'send_failed' where id = v_drop.id;
end;
$$;

create or replace function public.summon_discord_skin_claim_drop(
  p_guild_id text,
  p_channel_id text,
  p_discord_user_id text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text
)
returns table (drop_id bigint, skin_code integer, expires_at timestamptz, remaining_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop record;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_balance bigint;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord user identifier must be valid.';
  end if;
  select * into v_drop from public.force_reserve_discord_skin_claim_drop(
    p_guild_id, p_channel_id, p_skin_catalog_id, p_skin_name, p_champion_name,
    p_rarity, p_release_date, p_skin_line, p_image_url
  );
  if not found then
    return;
  end if;

  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;
  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_balance < v_economy.summon_base_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;
  v_balance := v_balance - v_economy.summon_base_cost;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -v_economy.summon_base_cost, v_balance, 'collection_summon');
  update public.discord_skin_claim_drops
  set claim_grace_discord_user_id = p_discord_user_id,
      claim_grace_expires_at = now() + make_interval(secs => v_economy.claim_grace_period_seconds),
      purchase_discord_user_id = p_discord_user_id,
      purchase_knowbucks_amount = v_economy.summon_base_cost
  where id = v_drop.drop_id;
  return query select v_drop.drop_id, v_drop.skin_code, v_drop.expires_at, v_balance;
end;
$$;

create or replace function public.gamble_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer,
  p_channel_id text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text
)
returns table (outcome text, skin_name text, drop_id bigint, new_skin_code integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_drop public.discord_skin_claim_drops%rowtype;
  v_active_drop public.discord_skin_claim_drops%rowtype;
  v_new_drop record;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' or p_skin_code not between 1000 and 9999 then
    raise exception 'Discord user identifier and skin ID must be valid.';
  end if;
  select * into v_owned_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id
    and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  -- Never consume a collection item when another live drop blocks the gamble.
  select * into v_active_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and status = 'pending'
  for update;
  if found then
    if v_active_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_active_drop.id;
    else
      return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
      return;
    end if;
  end if;

  if random() >= 0.25 then
    delete from public.discord_skin_claim_drops where id = v_owned_drop.id;
    return query select 'lost'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
    return;
  end if;

  select * into v_new_drop from public.force_reserve_discord_skin_claim_drop(
    p_guild_id, p_channel_id, p_skin_catalog_id, p_skin_name, p_champion_name,
    p_rarity, p_release_date, p_skin_line, p_image_url
  );
  if not found then
    return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz;
    return;
  end if;
  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  delete from public.discord_skin_claim_drops where id = v_owned_drop.id;
  update public.discord_skin_claim_drops
  set claim_grace_discord_user_id = p_discord_user_id,
      claim_grace_expires_at = now() + make_interval(secs => v_economy.claim_grace_period_seconds)
  where id = v_new_drop.drop_id;
  return query select 'spawned'::text, v_owned_drop.skin_name, v_new_drop.drop_id, v_new_drop.skin_code, v_new_drop.expires_at;
end;
$$;

create or replace function public.purchase_discord_skin_collection_capacity(
  p_guild_id text,
  p_discord_user_id text,
  p_slots integer
)
returns table (capacity integer, remaining_balance bigint, cost bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_extra_slots integer;
  v_balance bigint;
  v_cost bigint;
begin
  if p_slots not between 5 and 5000 or mod(p_slots, 5) <> 0 then
    raise exception 'Collection capacity purchases must add a multiple of five slots from 5 to 5,000.';
  end if;
  perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select * into v_economy from public.discord_skin_claim_economy_settings where guild_id = p_guild_id for share;
  select extra_slots into v_extra_slots from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  v_cost := (p_slots / 5)::bigint * v_economy.collection_capacity_upgrade_cost;
  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id) on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  if v_balance < v_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;
  v_balance := v_balance - v_cost;
  update public.discord_knowbucks_balances set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  update public.discord_skin_claim_collection_capacities
  set extra_slots = v_extra_slots + p_slots, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -v_cost, v_balance, 'collection_capacity_add');
  return query select v_economy.default_collection_capacity + v_extra_slots + p_slots, v_balance, v_cost;
end;
$$;

create or replace function public.force_add_discord_skin_collection_capacity(
  p_guild_id text,
  p_discord_user_id text,
  p_slots integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_extra_slots integer;
begin
  if p_slots not between 1 and 5000 then
    raise exception 'Collection capacity additions must be between 1 and 5,000 slots.';
  end if;
  perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select * into v_economy from public.discord_skin_claim_economy_settings where guild_id = p_guild_id for share;
  select extra_slots into v_extra_slots from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  update public.discord_skin_claim_collection_capacities
  set extra_slots = v_extra_slots + p_slots, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  return v_economy.default_collection_capacity + v_extra_slots + p_slots;
end;
$$;

create or replace function public.steal_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer
)
returns table (outcome text, skin_name text, previous_owner_discord_user_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_capacity integer;
  v_owned_count integer;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' or p_skin_code not between 1000 and 9999 then
    raise exception 'Discord user identifier and skin ID must be valid.';
  end if;
  select * into v_drop from public.discord_skin_claim_drops
  where guild_id = p_guild_id and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    return query select 'missing'::text, null::text, null::text;
    return;
  end if;
  if v_drop.owner_discord_user_id = p_discord_user_id then
    return query select 'own'::text, v_drop.skin_name, v_drop.owner_discord_user_id;
    return;
  end if;
  v_capacity := public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select count(*) into v_owned_count from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id and status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select 'full'::text, v_drop.skin_name, v_drop.owner_discord_user_id;
    return;
  end if;
  select * into v_economy from public.discord_skin_claim_economy_settings where guild_id = p_guild_id for share;
  if random() * 100 >= v_economy.collection_steal_chance_percent then
    return query select 'failed'::text, v_drop.skin_name, v_drop.owner_discord_user_id;
    return;
  end if;
  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_discord_user_id,
      owner_acquired_at = now(), ownership_method = 'stolen', is_favorite = false
  where id = v_drop.id;
  return query select 'stolen'::text, v_drop.skin_name, v_drop.owner_discord_user_id;
end;
$$;

create or replace function public.favorite_discord_skin_claim(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_code integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop public.discord_skin_claim_drops%rowtype;
begin
  select * into v_drop from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id
    and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;
  update public.discord_skin_claim_drops
  set is_favorite = false
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id
    and status = 'claimed' and is_favorite;
  update public.discord_skin_claim_drops set is_favorite = true where id = v_drop.id;
  return v_drop.skin_name;
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
  select * into v_drop from public.discord_skin_claim_drops
  where guild_id = p_guild_id and owner_discord_user_id = p_discord_user_id
    and skin_code = p_skin_code and status = 'claimed'
  for update;
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;
  select amount into v_amount from public.discord_skin_claim_sell_values
  where guild_id = p_guild_id and rarity = v_drop.rarity;
  if not found then
    raise exception 'A sell value is not configured for this skin rarity.';
  end if;
  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id) on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id for update;
  v_balance := v_balance + v_amount;
  delete from public.discord_skin_claim_drops where id = v_drop.id;
  update public.discord_knowbucks_balances set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, v_amount, v_balance, 'collection_sell');
  return query select v_drop.skin_name, v_amount, v_balance;
end;
$$;

revoke all on function public.replace_discord_skin_claim_economy_settings(text, bigint, integer, bigint, integer, integer, jsonb, uuid) from public;
revoke all on function public.replace_discord_collection_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, bigint, integer, bigint, integer, integer, jsonb, uuid) from public;
revoke all on function public.lock_discord_skin_claim_collection_capacity(text, text) from public;
revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
revoke all on function public.transfer_discord_skin_claim(text, text, text, integer) from public;
revoke all on function public.abandon_discord_skin_claim_drop(text, bigint) from public;
revoke all on function public.summon_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) from public;
revoke all on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) from public;
revoke all on function public.purchase_discord_skin_collection_capacity(text, text, integer) from public;
revoke all on function public.force_add_discord_skin_collection_capacity(text, text, integer) from public;
revoke all on function public.steal_discord_skin_claim(text, text, integer) from public;
revoke all on function public.favorite_discord_skin_claim(text, text, integer) from public;
revoke all on function public.sell_discord_skin_claim(text, text, integer) from public;
grant execute on function public.replace_discord_skin_claim_economy_settings(text, bigint, integer, bigint, integer, integer, jsonb, uuid) to service_role;
grant execute on function public.replace_discord_collection_configuration(text, boolean, integer, integer, boolean, text, text, text, jsonb, jsonb, jsonb, boolean, integer, integer, integer, boolean, text[], jsonb, bigint, integer, bigint, integer, integer, jsonb, uuid) to service_role;
grant execute on function public.lock_discord_skin_claim_collection_capacity(text, text) to service_role;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;
grant execute on function public.transfer_discord_skin_claim(text, text, text, integer) to service_role;
grant execute on function public.abandon_discord_skin_claim_drop(text, bigint) to service_role;
grant execute on function public.summon_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.purchase_discord_skin_collection_capacity(text, text, integer) to service_role;
grant execute on function public.force_add_discord_skin_collection_capacity(text, text, integer) to service_role;
grant execute on function public.steal_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.favorite_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.sell_discord_skin_claim(text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
