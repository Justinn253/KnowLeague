-- Splash Scramble's global completion total is a current-daily aggregate.
-- Persist it in Postgres so concurrent web instances agree on the count and
-- retain only a one-way browser identifier needed for daily idempotency.

create table if not exists public.splash_scramble_daily_stats (
  date_key date primary key,
  correct_solves bigint not null default 0 check (correct_solves >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.splash_scramble_daily_clients (
  date_key date not null references public.splash_scramble_daily_stats(date_key) on delete cascade,
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (date_key, client_hash)
);

alter table public.splash_scramble_daily_stats enable row level security;
alter table public.splash_scramble_daily_clients enable row level security;

revoke all on table public.splash_scramble_daily_stats from anon, authenticated;
revoke all on table public.splash_scramble_daily_clients from anon, authenticated;
grant select, insert, update, delete on table public.splash_scramble_daily_stats to service_role;
grant select, insert, update, delete on table public.splash_scramble_daily_clients to service_role;

create or replace function public.get_splash_scramble_daily_stats(p_date_key date)
returns table (
  date_key date,
  correct_solves bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p_date_key,
    coalesce((
      select stats.correct_solves
      from public.splash_scramble_daily_stats as stats
      where stats.date_key = p_date_key
    ), 0)::bigint;
$$;

create or replace function public.record_splash_scramble_daily_solve(
  p_date_key date,
  p_client_hash text
)
returns table (
  date_key date,
  correct_solves bigint,
  accepted boolean,
  client_already_solved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_client_hash text := lower(trim(p_client_hash));
  was_accepted boolean := false;
begin
  if p_date_key is null then
    raise exception 'date_key is required';
  end if;

  if normalized_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'client_hash is invalid';
  end if;

  insert into public.splash_scramble_daily_stats (date_key)
  values (p_date_key)
  on conflict (date_key) do nothing;

  insert into public.splash_scramble_daily_clients (date_key, client_hash)
  values (p_date_key, normalized_client_hash)
  on conflict (date_key, client_hash) do nothing
  returning true into was_accepted;

  was_accepted := coalesce(was_accepted, false);

  if was_accepted then
    update public.splash_scramble_daily_stats as stats
    set
      correct_solves = stats.correct_solves + 1,
      updated_at = now()
    where stats.date_key = p_date_key;
  end if;

  return query
  select
    stats.date_key,
    stats.correct_solves,
    was_accepted,
    not was_accepted
  from public.splash_scramble_daily_stats as stats
  where stats.date_key = p_date_key;
end;
$$;

revoke all on function public.get_splash_scramble_daily_stats(date) from public;
revoke all on function public.record_splash_scramble_daily_solve(date, text) from public;
grant execute on function public.get_splash_scramble_daily_stats(date) to service_role;
grant execute on function public.record_splash_scramble_daily_solve(date, text) to service_role;

-- The compound primary key starts with date_key, so each bounded retention
-- scan uses its existing index. Child rows are removed first to keep parent
-- deletion inexpensive.
create or replace function public.prune_splash_scramble_daily_stats(p_batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 500), 1000));
  deleted_rows integer;
  totals jsonb := '{}'::jsonb;
begin
  with candidates as (
    select client.date_key, client.client_hash
    from public.splash_scramble_daily_clients as client
    where client.date_key < current_date - 120
    order by client.date_key, client.client_hash
    limit safe_batch_size
  )
  delete from public.splash_scramble_daily_clients as client
  using candidates
  where client.date_key = candidates.date_key
    and client.client_hash = candidates.client_hash;
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('splash_scramble_daily_clients', deleted_rows);

  with candidates as (
    select stats.date_key
    from public.splash_scramble_daily_stats as stats
    where stats.date_key < current_date - 120
      and not exists (
        select 1
        from public.splash_scramble_daily_clients as client
        where client.date_key = stats.date_key
      )
    order by stats.date_key
    limit safe_batch_size
  )
  delete from public.splash_scramble_daily_stats as stats
  using candidates
  where stats.date_key = candidates.date_key;
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('splash_scramble_daily_stats', deleted_rows);

  return totals;
end;
$$;

revoke all on function public.prune_splash_scramble_daily_stats(integer) from public;
grant execute on function public.prune_splash_scramble_daily_stats(integer) to service_role;

do $splash_scramble_retention_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-splash-scramble-daily-stats'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-splash-scramble-daily-stats',
      '35 * * * *',
      'select public.prune_splash_scramble_daily_stats(500);'
    );
  else
    raise notice 'pg_cron is not enabled; see docs/data-retention.md to schedule Splash Scramble cleanup.';
  end if;
end;
$splash_scramble_retention_cron$;

notify pgrst, 'reload schema';
