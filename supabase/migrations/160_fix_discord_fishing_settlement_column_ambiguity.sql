begin;

-- The settlement function returns guild_id and discord_user_id as output
-- columns. In PL/pgSQL those output columns are variables, so unqualified
-- conflict targets and predicates with the same names are ambiguous. Replace
-- the function without changing its RPC signature or result shape.
create or replace function public.settle_discord_fishing_expedition(
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
  knowbucks_awarded bigint
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
    return query select false, null::text, null::text, null::text, null::jsonb, 0::bigint;
    return;
  end if;

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

    insert into public.discord_fishing_inventory (guild_id, discord_user_id, item_id, quantity)
    values (v_expedition.guild_id, v_expedition.discord_user_id, v_item_id, v_quantity)
    on conflict on constraint discord_fishing_inventory_pkey do update
    set quantity = public.discord_fishing_inventory.quantity + excluded.quantity,
        updated_at = now();
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
    p_knowbucks_awarded;
end;
$$;

revoke all on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.settle_discord_fishing_expedition(bigint, jsonb, bigint, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
