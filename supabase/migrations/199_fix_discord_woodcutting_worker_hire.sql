begin;

-- The return-table field `worker_number` shares a name with the worker table
-- column. Qualifying the aggregate removes PL/pgSQL's ambiguous reference at
-- runtime without altering the already-released Woodcutting foundation.
create or replace function public.hire_discord_woodcutting_worker(
  p_guild_id text,
  p_discord_user_id text,
  p_knowbucks_cost bigint
)
returns table (worker_number smallint, starter_axe_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_number smallint;
  v_starter_axe_id bigint := null;
  v_balance bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_knowbucks_cost not between 1 and 10000000000 then
    raise exception 'Woodcutting worker data is invalid.';
  end if;
  perform public.ensure_discord_woodcutting_player(p_guild_id, p_discord_user_id);
  perform 1 from public.discord_woodcutting_players as players
  where players.guild_id = p_guild_id and players.discord_user_id = p_discord_user_id
  for update;
  select coalesce(max(workers.worker_number), 0)::smallint + 1 into v_worker_number
  from public.discord_woodcutting_workers as workers
  where workers.guild_id = p_guild_id and workers.discord_user_id = p_discord_user_id;
  if v_worker_number > 10 then raise exception 'You already have the maximum of 10 lumberjacks.'; end if;

  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id) on conflict (guild_id, discord_user_id) do nothing;
  select balances.balance into v_balance from public.discord_knowbucks_balances as balances
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id
  for update;
  if v_balance < p_knowbucks_cost then raise exception 'Insufficient KnowBucks balance.'; end if;
  v_balance := v_balance - p_knowbucks_cost;
  update public.discord_knowbucks_balances as balances
  set balance = v_balance, updated_at = now()
  where balances.guild_id = p_guild_id and balances.discord_user_id = p_discord_user_id;
  insert into public.discord_knowbucks_transactions (guild_id, discord_user_id, amount, balance_after, source)
  values (p_guild_id, p_discord_user_id, -p_knowbucks_cost, v_balance, 'woodcutting_worker_hire');

  insert into public.discord_woodcutting_workers (guild_id, discord_user_id, worker_number)
  values (p_guild_id, p_discord_user_id, v_worker_number);
  if v_worker_number = 1 then
    insert into public.discord_woodcutting_axes (guild_id, discord_user_id, axe_tier)
    values (p_guild_id, p_discord_user_id, 1)
    returning id into v_starter_axe_id;
  end if;
  return query select v_worker_number, v_starter_axe_id;
end;
$$;

revoke all on function public.hire_discord_woodcutting_worker(text, text, bigint) from public;
grant execute on function public.hire_discord_woodcutting_worker(text, text, bigint) to service_role;

notify pgrst, 'reload schema';
commit;
