begin;

create or replace function public.purchase_discord_riftbound_mock_cart(
  p_guild_id text,
  p_discord_user_id text,
  p_products jsonb
)
returns table (
  charged_knowbucks bigint,
  balance_after bigint,
  sealed_products jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_balance bigint;
  v_running_balance bigint;
  v_unit_cost bigint;
  v_line_total bigint;
  v_total_cost bigint := 0;
  v_set_codes text[] := array[]::text[];
  v_lines jsonb := '[]'::jsonb;
  v_product jsonb;
  v_line record;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_products is null
    or jsonb_typeof(p_products) <> 'array'
    or jsonb_array_length(p_products) not between 1 and 10 then
    raise exception 'Riftbound mock cart data is invalid.';
  end if;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    if jsonb_typeof(v_product) <> 'object'
      or jsonb_typeof(v_product -> 'set_code') <> 'string'
      or jsonb_typeof(v_product -> 'product_kind') <> 'string'
      or jsonb_typeof(v_product -> 'quantity') <> 'number' then
      raise exception 'Riftbound mock cart data is invalid.';
    end if;

    if (v_product ->> 'set_code') not in ('OGN', 'SFD', 'UNL', 'VEN', 'RAD')
      or (v_product ->> 'product_kind') not in ('pack', 'box')
      or (v_product ->> 'quantity') !~ '^[0-9]+$'
      or char_length(v_product ->> 'quantity') > 3
      or (v_product ->> 'quantity')::integer not between 1 and 120 then
      raise exception 'Riftbound mock cart data is invalid.';
    end if;
  end loop;

  select details.user_id
  into v_user_id
  from public.profile_private_details as details
  where details.discord_user_id = p_discord_user_id
  for key share;

  if v_user_id is null then
    raise exception 'Link your KnowLeague account before using Riftbound mock unboxing.';
  end if;

  for v_line in
    select lines.set_code, lines.product_kind, sum(lines.quantity)::integer as quantity
    from jsonb_to_recordset(p_products) as lines(set_code text, product_kind text, quantity integer)
    group by lines.set_code, lines.product_kind
    order by lines.set_code, lines.product_kind
  loop
    if v_line.quantity not between 1 and 120 then
      raise exception 'Riftbound mock cart data is invalid.';
    end if;

    select case when v_line.product_kind = 'pack' then snapshots.pack_cost_knowbucks else snapshots.box_cost_knowbucks end
    into v_unit_cost
    from public.riftbound_mock_box_price_snapshots as snapshots
    where snapshots.set_code = v_line.set_code
    order by snapshots.week_start desc, snapshots.captured_at desc
    limit 1;

    if v_unit_cost is null then
      raise exception 'This set has no current mock box price. Please try again after the Monday market refresh.';
    end if;

    v_line_total := v_unit_cost * v_line.quantity;
    v_total_cost := v_total_cost + v_line_total;
    if v_total_cost > 10_000_000_000 then
      raise exception 'Riftbound mock purchase cost is invalid.';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'set_code', v_line.set_code,
      'product_kind', v_line.product_kind,
      'quantity', v_line.quantity,
      'total_cost', v_line_total
    ));
    if not (v_line.set_code = any(v_set_codes)) then
      v_set_codes := array_append(v_set_codes, v_line.set_code);
    end if;
  end loop;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select balances.balance
  into v_balance
  from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id
  for update;

  if v_balance < v_total_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;

  v_running_balance := v_balance;
  v_balance := v_balance - v_total_cost;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance,
      updated_at = now()
  where balances.guild_id = p_guild_id
    and balances.discord_user_id = p_discord_user_id;

  for v_line in
    select lines.set_code, lines.product_kind, lines.quantity, lines.total_cost
    from jsonb_to_recordset(v_lines) as lines(set_code text, product_kind text, quantity integer, total_cost bigint)
    order by lines.set_code, lines.product_kind
  loop
    v_running_balance := v_running_balance - v_line.total_cost;
    insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
    values (
      p_guild_id,
      p_discord_user_id,
      -v_line.total_cost,
      v_running_balance,
      case when v_line.product_kind = 'pack' then 'riftbound_mock_pack_purchase' else 'riftbound_mock_box_purchase' end
    );

    insert into public.discord_riftbound_mock_sealed_products as products (
      guild_id, user_id, set_code, pack_quantity, box_quantity, updated_at
    ) values (
      p_guild_id,
      v_user_id,
      v_line.set_code,
      case when v_line.product_kind = 'pack' then v_line.quantity else 0 end,
      case when v_line.product_kind = 'box' then v_line.quantity else 0 end,
      now()
    )
    on conflict (guild_id, user_id, set_code) do update
      set pack_quantity = products.pack_quantity + excluded.pack_quantity,
          box_quantity = products.box_quantity + excluded.box_quantity,
          updated_at = now();
  end loop;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'set_code', products.set_code,
      'pack_quantity', products.pack_quantity,
      'box_quantity', products.box_quantity
    ) order by products.set_code),
    '[]'::jsonb
  )
  into sealed_products
  from public.discord_riftbound_mock_sealed_products as products
  where products.guild_id = p_guild_id
    and products.user_id = v_user_id
    and products.set_code = any(v_set_codes);

  charged_knowbucks := v_total_cost;
  balance_after := v_balance;
  return next;
end;
$$;

revoke all on function public.purchase_discord_riftbound_mock_cart(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.purchase_discord_riftbound_mock_cart(text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
