begin;

-- Fishing is the first game skill. This generic table lets later games share
-- the same durable player-skill progression model without overloading chat XP.
create table public.discord_game_skill_progress (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  skill_id text not null check (skill_id ~ '^[a-z][a-z0-9-]{0,63}$'),
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 0 check (level between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id, skill_id)
);

create index discord_game_skill_progress_guild_skill_level_idx
  on public.discord_game_skill_progress(guild_id, skill_id, level desc, total_xp desc, discord_user_id asc);

alter table public.discord_game_skill_progress enable row level security;
revoke all on table public.discord_game_skill_progress from anon, authenticated;
grant select, insert, update, delete on table public.discord_game_skill_progress to service_role;

-- This is intentionally identical to the current character-level XP curve.
-- Fishing XP is separate, but familiar progression keeps the two readable.
create function public.discord_game_skill_total_xp_for_level(p_level integer)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_level not between 0 and 10000 then
    raise exception 'Game skill level must be between 0 and 10000.';
  end if;
  if p_level = 0 then
    return 0;
  end if;
  return 50::bigint * p_level * p_level - 100::bigint * p_level + 150;
end;
$$;

create function public.discord_game_skill_level_for_total_xp(p_total_xp bigint)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_level integer := 0;
begin
  while v_level < 10000
    and greatest(0, p_total_xp) >= public.discord_game_skill_total_xp_for_level(v_level + 1)
  loop
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

-- Character level is a permanent floor for Fishing level. The total XP is
-- raised to the corresponding threshold rather than granting a level reward.
create function public.ensure_discord_fishing_skill(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_level integer := 0;
  v_floor_xp bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select coalesce(members.level, 0) into v_character_level
  from public.discord_leveling_members as members
  where members.guild_id = p_guild_id
    and members.discord_user_id = p_discord_user_id;
  v_character_level := coalesce(v_character_level, 0);
  v_floor_xp := public.discord_game_skill_total_xp_for_level(v_character_level);

  insert into public.discord_game_skill_progress as skills (
    guild_id, discord_user_id, skill_id, total_xp, level
  ) values (
    p_guild_id, p_discord_user_id, 'fishing', v_floor_xp, v_character_level
  )
  on conflict (guild_id, discord_user_id, skill_id) do update
  set total_xp = greatest(skills.total_xp, excluded.total_xp),
      level = greatest(
        skills.level,
        excluded.level,
        public.discord_game_skill_level_for_total_xp(greatest(skills.total_xp, excluded.total_xp))
      ),
      updated_at = now();
end;
$$;

-- Baseline everyone already participating in chat leveling or Fishing. This
-- does not create a transaction or award retroactive level-up KnowBucks.
with players as (
  select guild_id, discord_user_id from public.discord_leveling_members
  union
  select guild_id, discord_user_id from public.discord_fishing_players
), floors as (
  select
    players.guild_id,
    players.discord_user_id,
    coalesce(members.level, 0) as character_level
  from players
  left join public.discord_leveling_members as members
    on members.guild_id = players.guild_id
    and members.discord_user_id = players.discord_user_id
)
insert into public.discord_game_skill_progress as skills (
  guild_id, discord_user_id, skill_id, total_xp, level
)
select
  floors.guild_id,
  floors.discord_user_id,
  'fishing',
  public.discord_game_skill_total_xp_for_level(floors.character_level),
  floors.character_level
from floors
on conflict (guild_id, discord_user_id, skill_id) do update
set total_xp = greatest(skills.total_xp, excluded.total_xp),
    level = greatest(
      skills.level,
      excluded.level,
      public.discord_game_skill_level_for_total_xp(greatest(skills.total_xp, excluded.total_xp))
    ),
    updated_at = now();

create function public.sync_discord_fishing_skill_floor_from_character_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_discord_fishing_skill(new.guild_id, new.discord_user_id);
  return new;
end;
$$;

drop trigger if exists discord_fishing_skill_character_floor on public.discord_leveling_members;
create trigger discord_fishing_skill_character_floor
after insert or update of level on public.discord_leveling_members
for each row execute function public.sync_discord_fishing_skill_floor_from_character_level();

-- Every fishing entry point initializes the skill row before reading it.
create or replace function public.ensure_discord_fishing_player(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  insert into public.discord_fishing_players (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id)
  values
    (p_guild_id, p_discord_user_id, 'plastic-rod'),
    (p_guild_id, p_discord_user_id, 'basic-bait')
  on conflict (guild_id, discord_user_id, item_id) do nothing;

  perform public.ensure_discord_fishing_skill(p_guild_id, p_discord_user_id);
end;
$$;

create or replace function public.start_discord_fishing_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_crew_slot smallint,
  p_biome_id text,
  p_duration_tier smallint,
  p_duration_seconds integer,
  p_notification_channel_id text,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb
)
returns table (expedition_id bigint, completes_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crew_one_unlocked boolean;
  v_crew_two_unlocked boolean;
  v_completes_at timestamptz;
  v_expedition_id bigint;
  v_fishing_level integer;
  v_required_fishing_level integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' or p_notification_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild, user, and channel identifiers must be valid snowflakes.';
  end if;
  if p_crew_slot not between 1 and 3 or p_duration_tier not between 1 and 4 then
    raise exception 'Fishing crew slot and duration tier are invalid.';
  end if;
  if p_duration_seconds not between 0 and 86400 then
    raise exception 'Fishing expedition duration must be between immediate and one day.';
  end if;
  if p_biome_id !~ '^[a-z0-9-]{1,64}$' or p_outcome_seed not between 1 and 2147483647
    or jsonb_typeof(p_equipment_snapshot) <> 'object' or octet_length(p_equipment_snapshot::text) > 8192 then
    raise exception 'Fishing expedition data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select players.crew_one_unlocked, players.crew_two_unlocked
  into v_crew_one_unlocked, v_crew_two_unlocked
  from public.discord_fishing_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;

  select skills.level into v_fishing_level
  from public.discord_game_skill_progress as skills
  where skills.guild_id = p_guild_id
    and skills.discord_user_id = p_discord_user_id
    and skills.skill_id = 'fishing'
  for share;
  if not found then
    raise exception 'Fishing skill profile is unavailable.';
  end if;
  v_required_fishing_level := case p_duration_tier
    when 1 then 0
    when 2 then 10
    when 3 then 20
    when 4 then 30
  end;
  if v_fishing_level < v_required_fishing_level then
    raise exception 'Expedition length % requires fishing level %.', p_duration_tier, v_required_fishing_level;
  end if;
  if p_crew_slot = 2 and not v_crew_one_unlocked then
    raise exception 'Crew 1 has not been unlocked.';
  end if;
  if p_crew_slot = 3 and not v_crew_two_unlocked then
    raise exception 'Crew 2 has not been unlocked.';
  end if;

  insert into public.discord_fishing_expeditions (
    guild_id, discord_user_id, crew_slot, biome_id, duration_tier, completes_at,
    notification_channel_id, outcome_seed, equipment_snapshot
  ) values (
    p_guild_id, p_discord_user_id, p_crew_slot, p_biome_id, p_duration_tier,
    now() + make_interval(secs => p_duration_seconds), p_notification_channel_id,
    p_outcome_seed, p_equipment_snapshot
  )
  returning id, public.discord_fishing_expeditions.completes_at into v_expedition_id, v_completes_at;
  return query select v_expedition_id, v_completes_at;
exception
  when unique_violation then
    raise exception 'That crew slot is already on an expedition.';
end;
$$;

drop function if exists public.purchase_discord_fishing_upgrade(text, text, text, text, bigint, integer);

create function public.purchase_discord_fishing_upgrade(
  p_guild_id text,
  p_discord_user_id text,
  p_item_id text,
  p_category text,
  p_cost bigint,
  p_required_fishing_level integer
)
returns table (current_balance bigint, crew_slots smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_fishing_level integer;
  v_crew_one_unlocked boolean;
  v_crew_two_unlocked boolean;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_item_id !~ '^[a-z0-9-]{1,64}$' or p_category not in ('rod', 'bait', 'boat', 'gear', 'skill', 'crew')
    or p_cost not between 1 and 1000000000 or p_required_fishing_level not between 0 and 10000 then
    raise exception 'Fishing shop purchase data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);
  select players.crew_one_unlocked, players.crew_two_unlocked
  into v_crew_one_unlocked, v_crew_two_unlocked
  from public.discord_fishing_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  select skills.level into v_fishing_level
  from public.discord_game_skill_progress as skills
  where skills.guild_id = p_guild_id
    and skills.discord_user_id = p_discord_user_id
    and skills.skill_id = 'fishing'
  for update;
  if not found then
    raise exception 'Fishing skill profile is unavailable.';
  end if;
  if v_fishing_level < p_required_fishing_level then
    raise exception 'This fishing upgrade requires fishing level %.', p_required_fishing_level;
  end if;
  if exists (
    select 1 from public.discord_fishing_inventory as inventory
    where inventory.guild_id = p_guild_id and inventory.discord_user_id = p_discord_user_id and inventory.item_id = p_item_id
  ) then
    raise exception 'You already own that fishing upgrade.';
  end if;
  if p_category = 'crew' and p_item_id = 'crew-2' and not v_crew_one_unlocked then
    raise exception 'Crew 1 must be unlocked before Crew 2.';
  end if;
  if p_category = 'crew' and p_item_id not in ('crew-1', 'crew-2') then
    raise exception 'Fishing crew data is invalid.';
  end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  if v_balance < p_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id)
  values (p_guild_id, p_discord_user_id, p_item_id);
  update public.discord_knowbucks_balances as balances
  set balance = v_balance - p_cost, updated_at = now()
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id;
  v_balance := v_balance - p_cost;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_cost, v_balance, 'fishing_shop_purchase');

  if p_category = 'rod' then
    update public.discord_fishing_players as players set equipped_rod_id = p_item_id, updated_at = now()
    where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id;
  elsif p_category = 'bait' then
    update public.discord_fishing_players as players set equipped_bait_id = p_item_id, updated_at = now()
    where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id;
  elsif p_item_id = 'crew-1' then
    update public.discord_fishing_players as players set crew_one_unlocked = true, updated_at = now()
    where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id;
    v_crew_one_unlocked := true;
  elsif p_item_id = 'crew-2' then
    update public.discord_fishing_players as players set crew_two_unlocked = true, updated_at = now()
    where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id;
    v_crew_two_unlocked := true;
  end if;

  return query select v_balance, (1 + v_crew_one_unlocked::integer + v_crew_two_unlocked::integer)::smallint;
end;
$$;

alter table public.discord_knowbucks_transactions
  drop constraint if exists discord_knowbucks_transactions_source_check;

alter table public.discord_knowbucks_transactions
  add constraint discord_knowbucks_transactions_source_check
  check (source in (
    'level_up', 'admin_add', 'admin_remove', 'admin_set', 'pay_received', 'pay_sent',
    'collection_summon', 'collection_summon_refund', 'collection_capacity_add',
    'collection_sell', 'collection_steal', 'fishing_expedition',
    'fishing_shop_purchase', 'fishing_chest_open', 'fishing_crate_open',
    'fishing_level_up'
  ));

drop function if exists public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb);

create function public.settle_discord_fishing_expedition(
  p_expedition_id bigint,
  p_result jsonb,
  p_knowbucks_awarded bigint,
  p_special_items jsonb
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
  v_expedition public.discord_fishing_expeditions%rowtype;
  v_balance bigint;
  v_item jsonb;
  v_item_id text;
  v_quantity integer;
  v_awarded_item_id text;
  v_awarded_gear_item_ids jsonb := '[]'::jsonb;
  v_fishing_xp_awarded bigint := 0;
  v_fishing_previous_level integer := 0;
  v_fishing_current_level integer := 0;
  v_fishing_total_xp bigint := 0;
  v_fishing_knowbucks_awarded bigint := 0;
begin
  if p_expedition_id < 1 or p_knowbucks_awarded not between 0 and 1000000000
    or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_result -> 'catches') <> 'array'
    or jsonb_typeof(p_special_items) <> 'array'
    or octet_length(p_result::text) > 32768 or octet_length(p_special_items::text) > 8192 then
    raise exception 'Fishing settlement data is invalid.';
  end if;
  if p_result ? 'fishingXpAwarded' then
    if jsonb_typeof(p_result -> 'fishingXpAwarded') <> 'number'
      or (p_result ->> 'fishingXpAwarded') !~ '^[0-9]+$' then
      raise exception 'Fishing XP award data is invalid.';
    end if;
    v_fishing_xp_awarded := (p_result ->> 'fishingXpAwarded')::bigint;
  end if;
  if v_fishing_xp_awarded not between 0 and 5000000 then
    raise exception 'Fishing XP award data is invalid.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_result -> 'catches') as catches(value)
    where catches.value ->> 'kind' = 'fish'
      and (
        coalesce(char_length(catches.value ->> 'name') between 1 and 100, false) = false
        or coalesce(catches.value ->> 'rarity' in ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'), false) = false
      )
  ) then
    raise exception 'Fishing catch data is invalid.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb, 0::bigint, null::integer, null::integer, null::bigint, 0::bigint;
    return;
  end if;

  perform 1
  from public.discord_fishing_players as players
  where players.guild_id = v_expedition.guild_id
    and players.discord_user_id = v_expedition.discord_user_id
  for update;
  if not found then
    raise exception 'Fishing profile is unavailable.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id
  for update;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb, 0::bigint, null::integer, null::integer, null::bigint, 0::bigint;
    return;
  end if;

  perform public.ensure_discord_fishing_skill(v_expedition.guild_id, v_expedition.discord_user_id);
  select skills.level, skills.total_xp
  into v_fishing_previous_level, v_fishing_total_xp
  from public.discord_game_skill_progress as skills
  where skills.guild_id = v_expedition.guild_id
    and skills.discord_user_id = v_expedition.discord_user_id
    and skills.skill_id = 'fishing'
  for update;
  if not found then
    raise exception 'Fishing skill profile is unavailable.';
  end if;
  v_fishing_total_xp := v_fishing_total_xp + v_fishing_xp_awarded;
  v_fishing_current_level := public.discord_game_skill_level_for_total_xp(v_fishing_total_xp);
  select coalesce(sum(greatest(
    1000::bigint,
    (
      public.discord_game_skill_total_xp_for_level(levels.level)
      - public.discord_game_skill_total_xp_for_level(levels.level - 1)
    ) * 10
  )), 0)::bigint
  into v_fishing_knowbucks_awarded
  from generate_series(v_fishing_previous_level + 1, v_fishing_current_level) as levels(level);
  update public.discord_game_skill_progress as skills
  set total_xp = v_fishing_total_xp,
      level = v_fishing_current_level,
      updated_at = now()
  where skills.guild_id = v_expedition.guild_id
    and skills.discord_user_id = v_expedition.discord_user_id
    and skills.skill_id = 'fishing';

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (v_expedition.guild_id, v_expedition.discord_user_id)
  on conflict on constraint discord_knowbucks_balances_pkey do nothing;
  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = v_expedition.guild_id
    and balances.discord_user_id = v_expedition.discord_user_id
  for update;

  if p_knowbucks_awarded > 0 then
    v_balance := v_balance + p_knowbucks_awarded;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance, updated_at = now()
    where balances.guild_id = v_expedition.guild_id and balances.discord_user_id = v_expedition.discord_user_id;
    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source
    ) values (
      v_expedition.guild_id, v_expedition.discord_user_id,
      p_knowbucks_awarded, v_balance, 'fishing_expedition'
    );
  end if;
  if v_fishing_knowbucks_awarded > 0 then
    v_balance := v_balance + v_fishing_knowbucks_awarded;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance, updated_at = now()
    where balances.guild_id = v_expedition.guild_id and balances.discord_user_id = v_expedition.discord_user_id;
    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source, level_from, level_to
    ) values (
      v_expedition.guild_id, v_expedition.discord_user_id,
      v_fishing_knowbucks_awarded, v_balance, 'fishing_level_up',
      v_fishing_previous_level, v_fishing_current_level
    );
  end if;

  for v_item in select items.value from jsonb_array_elements(p_special_items) as items
  loop
    v_item_id := v_item ->> 'itemId';
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_item_id !~ '^[a-z0-9-]{1,64}$' or v_quantity not between 1 and 1000 then
      raise exception 'Fishing special item data is invalid.';
    end if;
    if v_item_id like 'gear-%' then
      insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
      values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, 1)
      on conflict on constraint discord_fishing_inventory_pkey do nothing
      returning item_id into v_awarded_item_id;
      if found then
        v_awarded_gear_item_ids := v_awarded_gear_item_ids || jsonb_build_array(v_awarded_item_id);
      end if;
    else
      insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
      values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, v_quantity)
      on conflict on constraint discord_fishing_inventory_pkey do update
      set quantity = public.discord_fishing_inventory.quantity + excluded.quantity,
          updated_at = now();
    end if;
  end loop;

  insert into public.discord_fishing_catalogue_catches as catalogue (
    guild_id, discord_user_id, biome_id, fish_name, fish_rarity, first_caught_at, last_caught_at
  )
  select
    v_expedition.guild_id,
    v_expedition.discord_user_id,
    v_expedition.biome_id,
    catches.value ->> 'name',
    catches.value ->> 'rarity',
    now(),
    now()
  from jsonb_array_elements(p_result -> 'catches') as catches(value)
  where catches.value ->> 'kind' = 'fish'
    and v_expedition.biome_id in (
      'harbor', 'warm-ocean', 'hydroplant-reservoir', 'sunken-sea',
      'kelp-forest', 'crystaline-caverns', 'rallypoint-delta'
    )
  group by catches.value ->> 'name', catches.value ->> 'rarity'
  on conflict on constraint discord_fishing_catalogue_catches_pkey do update
  set last_caught_at = excluded.last_caught_at;

  update public.discord_fishing_expeditions as expeditions
  set status = 'completed',
      result = p_result,
      knowbucks_awarded = p_knowbucks_awarded,
      settled_at = now(),
      updated_at = now()
  where expeditions.id = v_expedition.id;

  return query select
    true,
    v_expedition.guild_id,
    v_expedition.discord_user_id,
    v_expedition.notification_channel_id,
    p_result,
    p_knowbucks_awarded,
    v_balance,
    v_awarded_gear_item_ids,
    v_fishing_xp_awarded,
    v_fishing_previous_level,
    v_fishing_current_level,
    v_fishing_total_xp,
    v_fishing_knowbucks_awarded;
end;
$$;

revoke all on function public.discord_game_skill_total_xp_for_level(integer) from public;
revoke all on function public.discord_game_skill_level_for_total_xp(bigint) from public;
revoke all on function public.ensure_discord_fishing_skill(text, text) from public;
revoke all on function public.ensure_discord_fishing_player(text, text) from public;
revoke all on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) from public;
revoke all on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint, integer) from public;
revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.ensure_discord_fishing_skill(text, text) to service_role;
grant execute on function public.ensure_discord_fishing_player(text, text) to service_role;
grant execute on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) to service_role;
grant execute on function public.purchase_discord_fishing_upgrade(text, text, text, text, bigint, integer) to service_role;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
