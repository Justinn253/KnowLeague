-- Skindle's global statistics only power the current daily puzzle. Keep a
-- four-month diagnostic window without retaining anonymous client activity
-- indefinitely. The child tables are pruned first so each hourly run remains
-- bounded and parent deletes never trigger a large cascade.
-- Existing primary keys all lead with date_key, so no secondary index is needed.

create or replace function public.prune_skindle_daily_stats(p_batch_size integer default 500)
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
    select guess.date_key, guess.skin_id
    from public.skindle_daily_skin_guesses as guess
    where guess.date_key < current_date - 120
    order by guess.date_key, guess.skin_id
    limit safe_batch_size
  )
  delete from public.skindle_daily_skin_guesses as guess
  using candidates
  where guess.date_key = candidates.date_key
    and guess.skin_id = candidates.skin_id;
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('skindle_daily_skin_guesses', deleted_rows);

  with candidates as (
    select client.date_key, client.client_id
    from public.skindle_daily_clients as client
    where client.date_key < current_date - 120
    order by client.date_key, client.client_id
    limit safe_batch_size
  )
  delete from public.skindle_daily_clients as client
  using candidates
  where client.date_key = candidates.date_key
    and client.client_id = candidates.client_id;
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('skindle_daily_clients', deleted_rows);

  with candidates as (
    select stats.date_key
    from public.skindle_daily_stats as stats
    where stats.date_key < current_date - 120
      and not exists (
        select 1
        from public.skindle_daily_skin_guesses as guess
        where guess.date_key = stats.date_key
      )
      and not exists (
        select 1
        from public.skindle_daily_clients as client
        where client.date_key = stats.date_key
      )
    order by stats.date_key
    limit safe_batch_size
  )
  delete from public.skindle_daily_stats as stats
  using candidates
  where stats.date_key = candidates.date_key;
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('skindle_daily_stats', deleted_rows);

  return totals;
end;
$$;

revoke all on function public.prune_skindle_daily_stats(integer) from public;
grant execute on function public.prune_skindle_daily_stats(integer) to service_role;

do $skindle_retention_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-skindle-daily-stats'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-skindle-daily-stats',
      '25 * * * *',
      'select public.prune_skindle_daily_stats(500);'
    );
  else
    raise notice 'pg_cron is not enabled; see docs/data-retention.md to schedule Skindle cleanup.';
  end if;
end;
$skindle_retention_cron$;

notify pgrst, 'reload schema';
