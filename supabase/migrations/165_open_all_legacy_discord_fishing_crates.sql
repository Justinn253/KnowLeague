begin;

-- Migration 164 preserves generic chest inventory as named crates. This
-- temporary service-role-only RPC lets the bot redeem every one atomically
-- before newly caught crates switch to automatic opening.
create function public.open_all_discord_fishing_crates(
  p_guild_id text,
  p_discord_user_id text,
  p_crates jsonb,
  p_knowbucks_awarded bigint
)
returns table (opened_count integer, current_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_opened_count integer;
  v_request_count integer;
  v_distinct_request_count integer;
begin
  if jsonb_typeof(p_crates) <> 'array' then
    raise exception 'Legacy fishing chest opening data is invalid.';
  end if;

  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or jsonb_array_length(p_crates) not between 1 and 35
    or p_knowbucks_awarded not between 1 and 25000000000 then
    raise exception 'Legacy fishing chest opening data is invalid.';
  end if;

  select
    count(*)::integer,
    count(distinct request.item_id)::integer,
    coalesce(sum(request.quantity), 0)::integer
  into v_request_count, v_distinct_request_count, v_opened_count
  from jsonb_to_recordset(p_crates) as request(item_id text, quantity integer);

  if v_request_count <> jsonb_array_length(p_crates)
    or v_request_count <> v_distinct_request_count
    or v_opened_count < 1
    or exists (
      select 1
      from jsonb_to_recordset(p_crates) as request(item_id text, quantity integer)
      where request.item_id is null
        or request.item_id !~ '^(harbor|warm-ocean|hydroplant-reservoir|sunken-sea|kelp-forest|crystaline-caverns|rallypoint-delta)-(common|uncommon|rare|epic|legendary)-crate$'
        or request.quantity is null
        or request.quantity not between 1 and 1000000
    ) then
    raise exception 'Legacy fishing chest opening data is invalid.';
  end if;

  perform public.ensure_discord_fishing_player(p_guild_id, p_discord_user_id);

  -- Keep the player lock first, matching expedition settlement and the
  -- original one-crate opener, so all fishing rewards share one lock order.
  perform 1
  from public.discord_fishing_players as players
  where players.guild_id = p_guild_id
    and players.discord_user_id = p_discord_user_id
  for update;

  if exists (
    with requested as (
      select request.item_id, request.quantity
      from jsonb_to_recordset(p_crates) as request(item_id text, quantity integer)
    )
    select 1
    from requested
    left join public.discord_fishing_inventory as inventory
      on inventory.guild_id = p_guild_id
      and inventory.discord_user_id = p_discord_user_id
      and inventory.item_id = requested.item_id
    where inventory.quantity is null or inventory.quantity < requested.quantity
  ) then
    raise exception 'You do not have every legacy fishing chest selected for opening.';
  end if;

  delete from public.discord_fishing_inventory as inventory
  using jsonb_to_recordset(p_crates) as request(item_id text, quantity integer)
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.item_id = request.item_id
    and inventory.quantity = request.quantity;

  update public.discord_fishing_inventory as inventory
  set quantity = inventory.quantity - request.quantity,
      updated_at = now()
  from jsonb_to_recordset(p_crates) as request(item_id text, quantity integer)
  where inventory.guild_id = p_guild_id
    and inventory.discord_user_id = p_discord_user_id
    and inventory.item_id = request.item_id
    and inventory.quantity > request.quantity;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict on constraint discord_knowbucks_balances_pkey do nothing;

  select balances.balance into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id
  for update;

  v_balance := v_balance + p_knowbucks_awarded;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id;

  insert into public.discord_knowbucks_transactions (
    guild_id, discord_user_id, amount, balance_after, source
  ) values (
    p_guild_id, p_discord_user_id, p_knowbucks_awarded, v_balance, 'fishing_crate_open'
  );

  return query select v_opened_count, v_balance;
end;
$$;

revoke all on function public.open_all_discord_fishing_crates(text, text, jsonb, bigint) from public;
grant execute on function public.open_all_discord_fishing_crates(text, text, jsonb, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
