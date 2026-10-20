begin;

-- New collection capacity increases stop at 50 slots. Existing claimed skins
-- and capacity records are preserved; this only normalizes the configurable
-- free allowance and prevents future upgrades beyond the ceiling.
update public.discord_skin_claim_economy_settings
set default_collection_capacity = 50,
    updated_at = now()
where default_collection_capacity > 50;

alter table public.discord_skin_claim_economy_settings
  add constraint discord_skin_claim_economy_settings_collection_capacity_max_check
  check (default_collection_capacity between 1 and 50);

-- A separate active-catalogue registry enforces one live or collected copy of
-- a skin per guild without deleting historical duplicate claims. It also lets
-- the bot exclude owned skins before choosing a weighted drop.
create table public.discord_skin_claim_catalog_locks (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  skin_catalog_id text not null check (skin_catalog_id ~ '^[0-9]{1,20}$'),
  locked_at timestamptz not null default now(),
  primary key (guild_id, skin_catalog_id)
);

insert into public.discord_skin_claim_catalog_locks (guild_id, skin_catalog_id)
select distinct guild_id, skin_catalog_id
from public.discord_skin_claim_drops
where status in ('pending', 'claimed')
on conflict (guild_id, skin_catalog_id) do nothing;

alter table public.discord_skin_claim_catalog_locks enable row level security;
revoke all on table public.discord_skin_claim_catalog_locks from anon, authenticated;
grant select on table public.discord_skin_claim_catalog_locks to service_role;

create or replace function public.sync_discord_skin_claim_catalog_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('pending', 'claimed') then
      if exists (
        select 1
        from public.discord_skin_claim_catalog_locks
        where guild_id = new.guild_id and skin_catalog_id = new.skin_catalog_id
      ) then
        raise exception 'This skin is already active or owned in this collection.';
      end if;
      insert into public.discord_skin_claim_catalog_locks (guild_id, skin_catalog_id)
      values (new.guild_id, new.skin_catalog_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('pending', 'claimed') then
      delete from public.discord_skin_claim_catalog_locks as locks
      where locks.guild_id = old.guild_id
        and locks.skin_catalog_id = old.skin_catalog_id
        and not exists (
          select 1
          from public.discord_skin_claim_drops as remaining
          where remaining.guild_id = old.guild_id
            and remaining.skin_catalog_id = old.skin_catalog_id
            and remaining.status in ('pending', 'claimed')
        );
    end if;
    return old;
  end if;

  if old.status in ('pending', 'claimed')
    and (new.status not in ('pending', 'claimed')
      or new.guild_id is distinct from old.guild_id
      or new.skin_catalog_id is distinct from old.skin_catalog_id) then
    delete from public.discord_skin_claim_catalog_locks as locks
    where locks.guild_id = old.guild_id
      and locks.skin_catalog_id = old.skin_catalog_id
      and not exists (
        select 1
        from public.discord_skin_claim_drops as remaining
        where remaining.guild_id = old.guild_id
          and remaining.skin_catalog_id = old.skin_catalog_id
          and remaining.status in ('pending', 'claimed')
      );
  end if;

  if new.status in ('pending', 'claimed')
    and (old.status not in ('pending', 'claimed')
      or new.guild_id is distinct from old.guild_id
      or new.skin_catalog_id is distinct from old.skin_catalog_id) then
    if exists (
      select 1
      from public.discord_skin_claim_catalog_locks
      where guild_id = new.guild_id and skin_catalog_id = new.skin_catalog_id
    ) then
      raise exception 'This skin is already active or owned in this collection.';
    end if;
    insert into public.discord_skin_claim_catalog_locks (guild_id, skin_catalog_id)
    values (new.guild_id, new.skin_catalog_id);
  end if;

  return new;
end;
$$;

create trigger discord_skin_claim_catalog_lock_sync
after insert or delete or update of guild_id, skin_catalog_id, status
on public.discord_skin_claim_drops
for each row
execute function public.sync_discord_skin_claim_catalog_lock();

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
  if p_slots not between 1 and 50 then
    raise exception 'Collection capacity purchases must add from 1 to 50 slots.';
  end if;
  perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  select extra_slots into v_extra_slots
  from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_economy.default_collection_capacity + v_extra_slots + p_slots > 50 then
    raise exception 'Collection capacity cannot exceed 50 slots.';
  end if;
  v_cost := p_slots::bigint * v_economy.collection_capacity_upgrade_cost;
  insert into public.discord_knowbucks_balances (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
  select balance into v_balance
  from public.discord_knowbucks_balances
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_balance < v_cost then
    raise exception 'Insufficient KnowBucks balance.';
  end if;
  v_balance := v_balance - v_cost;
  update public.discord_knowbucks_balances
  set balance = v_balance, updated_at = now()
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
  if p_slots not between 1 and 50 then
    raise exception 'Collection capacity additions must add from 1 to 50 slots.';
  end if;
  perform public.lock_discord_skin_claim_collection_capacity(p_guild_id, p_discord_user_id);
  select * into v_economy
  from public.discord_skin_claim_economy_settings
  where guild_id = p_guild_id
  for share;
  select extra_slots into v_extra_slots
  from public.discord_skin_claim_collection_capacities
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;
  if v_economy.default_collection_capacity + v_extra_slots + p_slots > 50 then
    raise exception 'Collection capacity cannot exceed 50 slots.';
  end if;
  update public.discord_skin_claim_collection_capacities
  set extra_slots = v_extra_slots + p_slots, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;
  return v_economy.default_collection_capacity + v_extra_slots + p_slots;
end;
$$;

revoke all on function public.sync_discord_skin_claim_catalog_lock() from public;
revoke all on function public.purchase_discord_skin_collection_capacity(text, text, integer) from public;
revoke all on function public.force_add_discord_skin_collection_capacity(text, text, integer) from public;
grant execute on function public.purchase_discord_skin_collection_capacity(text, text, integer) to service_role;
grant execute on function public.force_add_discord_skin_collection_capacity(text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
