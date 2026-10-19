begin;

-- Keep the player-row lock ahead of the expedition-row lock. Starting an
-- expedition locks the player before inserting its active-slot row, so this
-- ordering avoids a start/settlement deadlock when a due crew is selected at
-- the same moment it is being reconciled.
--
-- Return the balance produced by the settlement transaction as well. A
-- completion notice no longer needs a separate read after rewards commit,
-- which prevents a transient follow-up read failure from hiding a completed
-- expedition's Discord result.
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

  -- Read the immutable ownership key first without taking the expedition lock.
  -- The player lock below serializes concurrent starts, purchases, and awards.
  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb;
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

  -- Re-read under lock because another reconciler may have settled it while
  -- this call was waiting for the player row.
  select * into v_expedition
  from public.discord_fishing_expeditions as expeditions
  where expeditions.id = p_expedition_id
  for update;
  if not found or v_expedition.status <> 'active' or v_expedition.completes_at > now() then
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint, null::bigint, '[]'::jsonb;
    return;
  end if;

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
    v_balance,
    v_awarded_gear_item_ids;
end;
$$;

revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
