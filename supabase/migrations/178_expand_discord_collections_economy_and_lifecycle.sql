begin;

-- Force-summons need their own ledger source while retaining the existing
-- history categories from chat leveling, Collections, Fishing, and engagement.
alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_force', 'collection_summon_refund',
    'collection_capacity_add', 'collection_sell', 'collection_steal',
    'fishing_expedition', 'fishing_shop_purchase', 'fishing_chest_open',
    'fishing_crate_open', 'fishing_level_up', 'coinflip_win', 'coinflip_loss',
    'snipe', 'message_lottery', 'disboard_bump'
  ));

-- A normal summon cooldown and the force-summon counter share one row so
-- concurrent commands cannot undercharge or bypass a cooldown. The weekly
-- boundary is Monday 00:00 UTC and is evaluated on demand; no cron is needed.
create table if not exists public.discord_skin_claim_summon_cooldowns (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  available_at timestamptz not null,
  force_period_started_at timestamptz not null,
  force_summon_count integer not null default 0 check (force_summon_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

alter table public.discord_skin_claim_summon_cooldowns enable row level security;
revoke all on table public.discord_skin_claim_summon_cooldowns from anon, authenticated;
grant select, insert, update, delete on table public.discord_skin_claim_summon_cooldowns to service_role;

-- Collection display order is durable independently of acquisition time. It
-- powers the top-ten reorder command and preserves a member's chosen order
-- when they browse their collection later.
alter table public.discord_skin_claim_drops
  add column if not exists collection_order bigint;

with ranked_claims as (
  select
    drops.id,
    row_number() over (
      partition by drops.guild_id, drops.owner_discord_user_id
      order by drops.is_favorite desc, drops.owner_acquired_at desc nulls last, drops.id desc
    ) as collection_order
  from public.discord_skin_claim_drops as drops
  where drops.status = 'claimed' and drops.owner_discord_user_id is not null
)
update public.discord_skin_claim_drops as drops
set collection_order = ranked_claims.collection_order
from ranked_claims
where drops.id = ranked_claims.id;

create unique index if not exists discord_skin_claim_owner_collection_order_idx
  on public.discord_skin_claim_drops(guild_id, owner_discord_user_id, collection_order)
  where status = 'claimed' and owner_discord_user_id is not null and collection_order is not null;

-- Apply the agreed sell values to the existing guild configuration as well as
-- the web application's defaults for newly configured Collections instances.
update public.discord_skin_claim_sell_values as sell_values
set amount = defaults.amount,
    updated_at = now()
from (values
  ('Common'::text, 500::bigint),
  ('Rare'::text, 1000::bigint),
  ('Epic'::text, 2500::bigint),
  ('Legendary'::text, 10000::bigint),
  ('Mythic'::text, 5000::bigint),
  ('Ultimate'::text, 25000::bigint),
  ('Exalted'::text, 100000::bigint),
  ('Transcendent'::text, 100000::bigint)
) as defaults(rarity, amount)
where sell_values.rarity = defaults.rarity;

-- Force-summon costs may eventually exceed the configurable base-cost cap.
alter table public.discord_skin_claim_drops
  drop constraint if exists discord_skin_claim_drops_purchase_knowbucks_amount_check;

alter table public.discord_skin_claim_drops
  add constraint discord_skin_claim_drops_purchase_knowbucks_amount_check
  check (purchase_knowbucks_amount is null or purchase_knowbucks_amount between 1 and 9223372036854775807);

create or replace function public.get_discord_collection_fishing_skill_levels(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  lucky_level integer,
  cheapskate_level integer,
  money_mouser_level integer,
  haste_level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    least(5, count(*) filter (where inventory.item_id in ('lucky-1', 'lucky-2', 'lucky-3', 'lucky-4', 'lucky-5')))::integer,
    least(4, count(*) filter (where inventory.item_id in ('cheapskate-1', 'cheapskate-2', 'cheapskate-3', 'cheapskate-4')))::integer,
    least(2, count(*) filter (where inventory.item_id in ('money-mouser-1', 'money-mouser-2')))::integer,
    least(4, count(*) filter (where inventory.item_id in ('haste-1', 'haste-2', 'haste-3', 'haste-4')))::integer
  from public.discord_fishing_inventory as inventory
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id;
$$;

create or replace function public.reorder_discord_skin_collection(
  p_guild_id text,
  p_discord_user_id text,
  p_skin_codes integer[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordered_ids bigint[];
  v_remaining_ids bigint[];
  v_selected_ids bigint[];
  v_position integer;
  v_skin_name text;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_skin_codes is null
    or cardinality(p_skin_codes) not between 1 and 10
    or exists (select 1 from unnest(p_skin_codes) as requested(skin_code) where requested.skin_code not between 1000 and 9999)
    or cardinality(p_skin_codes) <> (select count(distinct requested.skin_code) from unnest(p_skin_codes) as requested(skin_code)) then
    raise exception 'Provide one to ten unique four-digit skin IDs.';
  end if;

  -- Reuse the per-member collection lock shared by claim, transfer, and steal
  -- so a newly claimed skin cannot race the temporary ordering values below.
  perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);

  perform 1
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.status = 'claimed'
  for update;

  if exists (
    select 1
    from unnest(p_skin_codes) as requested(skin_code)
    where not exists (
      select 1
      from public.discord_skin_claim_drops as drops
      where drops.guild_id = p_guild_id
        and drops.owner_discord_user_id = p_discord_user_id
        and drops.status = 'claimed'
        and drops.skin_code = requested.skin_code
    )
  ) then
    raise exception 'You do not own every requested skin ID.';
  end if;

  select array_agg(drops.id order by array_position(p_skin_codes, drops.skin_code))
  into v_selected_ids
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.status = 'claimed'
    and drops.skin_code = any(p_skin_codes);

  select array_agg(drops.id order by drops.collection_order asc nulls last, drops.owner_acquired_at desc nulls last, drops.id desc)
  into v_remaining_ids
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.status = 'claimed'
    and not (drops.skin_code = any(p_skin_codes));

  v_ordered_ids := coalesce(v_selected_ids, '{}'::bigint[]) || coalesce(v_remaining_ids, '{}'::bigint[]);
  if cardinality(v_ordered_ids) is null then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  -- Temporarily move every row out of the positive sequence so the partial
  -- unique index never observes two skins in the same slot during a reorder.
  update public.discord_skin_claim_drops as drops
  set collection_order = -drops.id,
      is_favorite = false
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.status = 'claimed';

  for v_position in 1..cardinality(v_ordered_ids) loop
    update public.discord_skin_claim_drops
    set collection_order = v_position,
        is_favorite = v_position = 1
    where id = v_ordered_ids[v_position];
  end loop;

  select drops.skin_name into v_skin_name
  from public.discord_skin_claim_drops as drops
  where drops.id = v_ordered_ids[1];
  return v_skin_name;
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
  v_skin_name text;
begin
  select drops.skin_name into v_skin_name
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id
    and drops.owner_discord_user_id = p_discord_user_id
    and drops.skin_code = p_skin_code
    and drops.status = 'claimed';
  if not found then
    raise exception 'You do not own a claimed skin with that four-digit ID.';
  end if;

  perform public.reorder_discord_skin_collection(p_guild_id, p_discord_user_id, array[p_skin_code]);
  return v_skin_name;
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
  v_collection_order bigint;
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
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';
  if v_owned_count >= v_capacity then
    return query select false, v_drop.skin_code, v_drop.skin_name, v_drop.champion_name, v_drop.rarity, v_drop.release_date, v_drop.skin_line, v_drop.image_url;
    return;
  end if;
  select coalesce(max(drops.collection_order), 0) + 1 into v_collection_order
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';

  update public.discord_skin_claim_drops
  set status = 'claimed',
      claimed_by_discord_user_id = p_discord_user_id,
      owner_discord_user_id = p_discord_user_id,
      claimed_at = now(),
      owner_acquired_at = now(),
      ownership_method = 'claimed',
      is_favorite = false,
      collection_order = v_collection_order,
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
  v_collection_order bigint;
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
  select coalesce(max(drops.collection_order), 0) + 1 into v_collection_order
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_recipient_discord_user_id and drops.status = 'claimed';

  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_recipient_discord_user_id,
      owner_acquired_at = now(),
      ownership_method = 'transferred',
      is_favorite = false,
      collection_order = v_collection_order,
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
  v_skills record;
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
  select * into v_skills
  from public.get_discord_collection_fishing_skill_levels(p_guild_id, p_discord_user_id);
  v_amount := ceil(v_amount::numeric * (1 + (v_skills.money_mouser_level::numeric * 0.50)))::bigint;

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
  v_collection_order bigint;
  v_skills record;
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
  select * into v_skills
  from public.get_discord_collection_fishing_skill_levels(p_guild_id, p_discord_user_id);
  v_cost := ceil(v_sell_amount::numeric * 3 * greatest(0::numeric, 1 - (v_skills.cheapskate_level::numeric * 0.05)))::bigint;

  select economy.collection_steal_chance_percent into v_steal_chance_percent
  from public.discord_skin_claim_economy_settings as economy
  where economy.guild_id = p_guild_id;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;
  v_steal_chance_percent := least(100, v_steal_chance_percent + v_skills.lucky_level);

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
  select coalesce(max(drops.collection_order), 0) + 1 into v_collection_order
  from public.discord_skin_claim_drops as drops
  where drops.guild_id = p_guild_id and drops.owner_discord_user_id = p_discord_user_id and drops.status = 'claimed';
  update public.discord_skin_claim_drops
  set owner_discord_user_id = p_discord_user_id,
      owner_acquired_at = now(),
      ownership_method = 'stolen',
      is_favorite = false,
      collection_order = v_collection_order
  where id = v_drop.id;
  return query select 'stolen'::text, v_drop.skin_name, v_drop.owner_discord_user_id, v_cost, v_balance, v_available_at;
end;
$$;

drop function if exists public.summon_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text);

create function public.summon_discord_skin_claim_drop(
  p_guild_id text,
  p_channel_id text,
  p_discord_user_id text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text,
  p_force boolean default false
)
returns table (
  outcome text,
  drop_id bigint,
  skin_code integer,
  expires_at timestamptz,
  remaining_balance bigint,
  charged_cost bigint,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_drop record;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_balance bigint;
  v_cost bigint;
  v_base_cost numeric;
  v_available_at timestamptz;
  v_week_start timestamptz;
  v_force_summon_count integer;
  v_skills record;
begin
  if p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord user identifier must be valid.';
  end if;

  insert into public.discord_skin_claim_summon_cooldowns (
    guild_id, discord_user_id, available_at, force_period_started_at, force_summon_count
  ) values (
    p_guild_id,
    p_discord_user_id,
    now(),
    date_trunc('week', now() at time zone 'UTC') at time zone 'UTC',
    0
  ) on conflict (guild_id, discord_user_id) do nothing;

  select cooldowns.available_at, cooldowns.force_period_started_at, cooldowns.force_summon_count
  into v_available_at, v_week_start, v_force_summon_count
  from public.discord_skin_claim_summon_cooldowns as cooldowns
  where cooldowns.guild_id = p_guild_id and cooldowns.discord_user_id = p_discord_user_id
  for update;

  if v_week_start < date_trunc('week', now() at time zone 'UTC') at time zone 'UTC' then
    v_week_start := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
    v_force_summon_count := 0;
    update public.discord_skin_claim_summon_cooldowns
    set force_period_started_at = v_week_start,
        force_summon_count = 0,
        updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  end if;

  if p_force and v_available_at <= now() then
    return query select 'not-on-cooldown'::text, null::bigint, null::integer, null::timestamptz, null::bigint, null::bigint, v_available_at;
    return;
  end if;
  if not p_force and v_available_at > now() then
    return query select 'cooldown'::text, null::bigint, null::integer, null::timestamptz, null::bigint, null::bigint, v_available_at;
    return;
  end if;

  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  if not found then
    raise exception 'Discord collection economy has not been configured.';
  end if;
  select * into v_skills
  from public.get_discord_collection_fishing_skill_levels(p_guild_id, p_discord_user_id);
  v_base_cost := case
    when p_force then 5000::numeric * power(1.50::numeric, v_force_summon_count)
    else v_economy.summon_base_cost::numeric
  end;
  v_cost := greatest(1::numeric, ceil(v_base_cost * greatest(0::numeric, 1 - (v_skills.cheapskate_level::numeric * 0.05))))::bigint;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  if v_balance < v_cost then
    return query select 'insufficient-funds'::text, null::bigint, null::integer, null::timestamptz, v_balance, v_cost, v_available_at;
    return;
  end if;

  select * into v_drop from public.force_reserve_discord_skin_claim_drop(
    p_guild_id, p_channel_id, p_skin_catalog_id, p_skin_name, p_champion_name,
    p_rarity, p_release_date, p_skin_line, p_image_url
  );
  if not found then
    return query select 'active-drop'::text, null::bigint, null::integer, null::timestamptz, v_balance, v_cost, v_available_at;
    return;
  end if;

  v_balance := v_balance - v_cost;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (
    p_guild_id,
    p_discord_user_id,
    -v_cost,
    v_balance,
    case when p_force then 'collection_summon_force' else 'collection_summon' end
  );

  if p_force then
    update public.discord_skin_claim_summon_cooldowns
    set force_period_started_at = v_week_start,
        force_summon_count = v_force_summon_count + 1,
        updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  else
    v_available_at := now() + make_interval(secs => (14400 * (1 - (v_skills.haste_level * 0.05)))::integer);
    update public.discord_skin_claim_summon_cooldowns
    set available_at = v_available_at,
        updated_at = now()
    where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  end if;

  update public.discord_skin_claim_drops
  set claim_grace_discord_user_id = p_discord_user_id,
      claim_grace_expires_at = now() + make_interval(secs => v_economy.claim_grace_period_seconds),
      purchase_discord_user_id = p_discord_user_id,
      purchase_knowbucks_amount = v_cost
  where id = v_drop.drop_id;
  return query select 'spawned'::text, v_drop.drop_id, v_drop.skin_code, v_drop.expires_at, v_balance, v_cost, v_available_at;
end;
$$;

drop function if exists public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text);

create function public.gamble_discord_skin_claim(
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
returns table (
  outcome text,
  skin_name text,
  drop_id bigint,
  new_skin_code integer,
  expires_at timestamptz,
  success_chance_percent integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned_drop public.discord_skin_claim_drops%rowtype;
  v_active_drop public.discord_skin_claim_drops%rowtype;
  v_new_drop record;
  v_economy public.discord_skin_claim_economy_settings%rowtype;
  v_skills record;
  v_success_chance_percent integer;
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

  select * into v_active_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and status = 'pending'
  for update;
  if found then
    if v_active_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_active_drop.id;
    else
      return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz, null::integer;
      return;
    end if;
  end if;

  select * into v_skills
  from public.get_discord_collection_fishing_skill_levels(p_guild_id, p_discord_user_id);
  v_success_chance_percent := least(65, 25 + (v_skills.lucky_level * 10));
  if random() * 100 >= v_success_chance_percent then
    delete from public.discord_skin_claim_drops where id = v_owned_drop.id;
    return query select 'lost'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz, v_success_chance_percent;
    return;
  end if;

  select * into v_new_drop from public.force_reserve_discord_skin_claim_drop(
    p_guild_id, p_channel_id, p_skin_catalog_id, p_skin_name, p_champion_name,
    p_rarity, p_release_date, p_skin_line, p_image_url
  );
  if not found then
    return query select 'blocked'::text, v_owned_drop.skin_name, null::bigint, null::integer, null::timestamptz, v_success_chance_percent;
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
  return query select 'spawned'::text, v_owned_drop.skin_name, v_new_drop.drop_id, v_new_drop.skin_code, v_new_drop.expires_at, v_success_chance_percent;
end;
$$;

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
    delete from public.discord_skin_claim_steal_cooldowns
    where discord_user_id = old.discord_user_id;
    delete from public.discord_skin_claim_summon_cooldowns
    where discord_user_id = old.discord_user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists discord_skin_claim_profile_delete_cleanup on public.profile_private_details;
create trigger discord_skin_claim_profile_delete_cleanup
before delete on public.profile_private_details
for each row
execute function public.clear_discord_skin_collection_on_profile_delete();

revoke all on function public.get_discord_collection_fishing_skill_levels(text, text) from public;
revoke all on function public.reorder_discord_skin_collection(text, text, integer[]) from public;
revoke all on function public.favorite_discord_skin_claim(text, text, integer) from public;
revoke all on function public.claim_discord_skin_drop(text, text, text) from public;
revoke all on function public.transfer_discord_skin_claim(text, text, text, integer) from public;
revoke all on function public.sell_discord_skin_claim(text, text, integer) from public;
revoke all on function public.steal_discord_skin_claim(text, text, integer) from public;
revoke all on function public.summon_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text, boolean) from public;
revoke all on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) from public;
revoke all on function public.clear_discord_skin_collection(text, text) from public;
revoke all on function public.clear_discord_skin_collection_on_profile_delete() from public;

grant execute on function public.get_discord_collection_fishing_skill_levels(text, text) to service_role;
grant execute on function public.reorder_discord_skin_collection(text, text, integer[]) to service_role;
grant execute on function public.favorite_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.claim_discord_skin_drop(text, text, text) to service_role;
grant execute on function public.transfer_discord_skin_claim(text, text, text, integer) to service_role;
grant execute on function public.sell_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.steal_discord_skin_claim(text, text, integer) to service_role;
grant execute on function public.summon_discord_skin_claim_drop(text, text, text, text, text, text, text, date, text, text, boolean) to service_role;
grant execute on function public.gamble_discord_skin_claim(text, text, integer, text, text, text, text, text, date, text, text) to service_role;
grant execute on function public.clear_discord_skin_collection(text, text) to service_role;

notify pgrst, 'reload schema';

commit;
