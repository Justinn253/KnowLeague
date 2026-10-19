begin;

-- Replace the retired rod and bait identifiers without invalidating owned
-- equipment or an expedition that was already in progress during deployment.
alter table public.discord_fishing_players
  alter column equipped_rod_id set default 'plastic-rod';

update public.discord_fishing_players
set equipped_rod_id = case equipped_rod_id
  when 'starter-rod' then 'plastic-rod'
  when 'river-rod' then 'fiberglass-rod'
  when 'tidecaller-rod' then 'reinforced-rod'
  when 'abyssal-rod' then 'master-rod'
  else equipped_rod_id
end,
equipped_bait_id = case equipped_bait_id
  when 'silver-lure' then 'chum'
  when 'deep-glow-bait' then 'bloodworms'
  else equipped_bait_id
end,
updated_at = now()
where equipped_rod_id in ('starter-rod', 'river-rod', 'tidecaller-rod', 'abyssal-rod')
   or equipped_bait_id in ('silver-lure', 'deep-glow-bait');

update public.discord_fishing_inventory
set item_id = case item_id
  when 'starter-rod' then 'plastic-rod'
  when 'river-rod' then 'fiberglass-rod'
  when 'tidecaller-rod' then 'reinforced-rod'
  when 'abyssal-rod' then 'master-rod'
  when 'silver-lure' then 'chum'
  when 'deep-glow-bait' then 'bloodworms'
  when 'lucky-charm' then 'lucky-1'
  when 'money-mouser' then 'money-mouser-1'
  else item_id
end,
updated_at = now()
where item_id in (
  'starter-rod', 'river-rod', 'tidecaller-rod', 'abyssal-rod',
  'silver-lure', 'deep-glow-bait', 'lucky-charm', 'money-mouser'
);

update public.discord_fishing_expeditions as expeditions
set equipment_snapshot = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        expeditions.equipment_snapshot,
        '{rodItemId}',
        to_jsonb(case expeditions.equipment_snapshot ->> 'rodItemId'
          when 'starter-rod' then 'plastic-rod'
          when 'river-rod' then 'fiberglass-rod'
          when 'tidecaller-rod' then 'reinforced-rod'
          when 'abyssal-rod' then 'master-rod'
          else expeditions.equipment_snapshot ->> 'rodItemId'
        end),
        true
      ),
      '{baitItemId}',
      to_jsonb(case expeditions.equipment_snapshot ->> 'baitItemId'
        when 'silver-lure' then 'chum'
        when 'deep-glow-bait' then 'bloodworms'
        else expeditions.equipment_snapshot ->> 'baitItemId'
      end),
      true
    ),
    '{passiveItemIds}',
    coalesce((
      select jsonb_agg(case passive_item.item_id
        when 'lucky-charm' then 'lucky-1'
        when 'money-mouser' then 'money-mouser-1'
        else passive_item.item_id
      end)
      from jsonb_array_elements_text(coalesce(expeditions.equipment_snapshot -> 'passiveItemIds', '[]'::jsonb)) as passive_item(item_id)
    ), '[]'::jsonb),
    true
  ),
  '{catalogueVersion}',
  '3'::jsonb,
  true
)
where expeditions.status = 'active';

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
end;
$$;

-- A Teleporter return settles immediately after its launch message is stored.
-- Retain the original status/result invariant while allowing zero duration.
do $$
declare
  v_constraint_name text;
begin
  select constraints.conname into v_constraint_name
  from pg_constraint as constraints
  where constraints.conrelid = 'public.discord_fishing_expeditions'::regclass
    and constraints.contype = 'c'
    and pg_get_constraintdef(constraints.oid) like '%completes_at > started_at%';

  if v_constraint_name is not null then
    execute format('alter table public.discord_fishing_expeditions drop constraint %I', v_constraint_name);
  end if;
end;
$$;

alter table public.discord_fishing_expeditions
  add constraint discord_fishing_expeditions_completion_after_start_check
  check (completes_at >= started_at);

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
  awarded_gear_item_ids jsonb
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
begin
  if p_expedition_id < 1 or p_knowbucks_awarded not between 0 and 1000000000
    or jsonb_typeof(p_result) <> 'object' or jsonb_typeof(p_special_items) <> 'array'
    or octet_length(p_result::text) > 32768 or octet_length(p_special_items::text) > 8192 then
    raise exception 'Fishing settlement data is invalid.';
  end if;

  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id
  for update;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, '[]'::jsonb;
    return;
  end if;

  perform 1
  from public.discord_fishing_players as players
  where players.guild_id = v_expedition.guild_id
    and players.discord_user_id = v_expedition.discord_user_id
  for update;

  if p_knowbucks_awarded > 0 then
    insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
    values (v_expedition.guild_id, v_expedition.discord_user_id)
    on conflict on constraint discord_knowbucks_balances_pkey do nothing;

    select balances.balance into v_balance
    from public.discord_knowbucks_balances as balances
    where balances.guild_id = v_expedition.guild_id
      and balances.discord_user_id = v_expedition.discord_user_id
    for update;

    v_balance := v_balance + p_knowbucks_awarded;
    update public.discord_knowbucks_balances as balances
    set balance = v_balance,
        updated_at = now()
    where balances.guild_id = v_expedition.guild_id
      and balances.discord_user_id = v_expedition.discord_user_id;

    insert into public.discord_knowbucks_transactions (
      guild_id, discord_user_id, amount, balance_after, source
    ) values (
      v_expedition.guild_id, v_expedition.discord_user_id,
      p_knowbucks_awarded, v_balance, 'fishing_expedition'
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
    v_awarded_gear_item_ids;
end;
$$;

revoke all on function public.ensure_discord_fishing_player(text, text) from public;
revoke all on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) from public;
revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.ensure_discord_fishing_player(text, text) to service_role;
grant execute on function public.start_discord_fishing_expedition(text, text, smallint, text, smallint, integer, text, integer, jsonb) to service_role;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
