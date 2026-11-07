-- Mining and Fishing only project current progress plus a player's most recent
-- result. Keep a diagnostic window without leaving completed expedition JSON
-- payloads or the Mining Discord-delivery outbox unbounded.
--
-- Latest completed expeditions are retained per player: Fishing uses that row
-- as its fallback notification channel, and it preserves the result surface
-- for dormant players without retaining their whole history indefinitely.

create index if not exists discord_mining_expeditions_completed_retention_idx
  on public.discord_mining_expeditions (settled_at, id)
  where status = 'completed';

create index if not exists discord_fishing_expeditions_completed_retention_idx
  on public.discord_fishing_expeditions (settled_at, id)
  where status = 'completed';

create index if not exists discord_mining_website_panel_events_delivered_retention_idx
  on public.discord_mining_website_panel_events (delivered_at, id)
  where delivered_at is not null;

create index if not exists discord_mining_website_panel_events_pending_retention_idx
  on public.discord_mining_website_panel_events (created_at, id)
  where delivered_at is null;

create or replace function public.prune_discord_companion_history(p_batch_size integer default 500)
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
  -- A delivery receipt is only operationally useful for a short retry/audit
  -- window. Remove delivered rows before their parent expedition can age out.
  with candidates as (
    select event.id
    from public.discord_mining_website_panel_events as event
    where event.delivered_at < now() - interval '30 days'
    order by event.delivered_at, event.id
    limit safe_batch_size
  )
  delete from public.discord_mining_website_panel_events as event
  where event.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('delivered_mining_website_panel_events', deleted_rows);

  -- The outbox is explicitly short-lived. A worker that cannot deliver for a
  -- month must not pin an otherwise-expired completed expedition forever.
  with candidates as (
    select event.id
    from public.discord_mining_website_panel_events as event
    where event.delivered_at is null
      and event.created_at < now() - interval '30 days'
    order by event.created_at, event.id
    limit safe_batch_size
  )
  delete from public.discord_mining_website_panel_events as event
  where event.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('expired_mining_website_panel_events', deleted_rows);

  -- Do not remove the latest completed Mining expedition for a player. Its
  -- result is small in normal operation and retaining one row avoids changing
  -- the companion's dormant-player behavior.
  with candidates as (
    select expedition.id
    from public.discord_mining_expeditions as expedition
    where expedition.status = 'completed'
      and expedition.settled_at < now() - interval '120 days'
      and not exists (
        select 1
        from public.discord_mining_website_panel_events as event
        where event.expedition_id = expedition.id
      )
      and exists (
        select 1
        from public.discord_mining_expeditions as newer
        where newer.guild_id = expedition.guild_id
          and newer.discord_user_id = expedition.discord_user_id
          and newer.status = 'completed'
          and (newer.settled_at, newer.id) > (expedition.settled_at, expedition.id)
      )
    order by expedition.settled_at, expedition.id
    limit safe_batch_size
  )
  delete from public.discord_mining_expeditions as expedition
  where expedition.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('completed_mining_expeditions', deleted_rows);

  -- Fishing reads the newest completed voyage for the dashboard and may use
  -- it as the fallback Discord notification destination. Preserve that one
  -- row while bounding older settled result payloads.
  with candidates as (
    select expedition.id
    from public.discord_fishing_expeditions as expedition
    where expedition.status = 'completed'
      and expedition.settled_at < now() - interval '120 days'
      and exists (
        select 1
        from public.discord_fishing_expeditions as newer
        where newer.guild_id = expedition.guild_id
          and newer.discord_user_id = expedition.discord_user_id
          and newer.status = 'completed'
          and (newer.settled_at, newer.id) > (expedition.settled_at, expedition.id)
      )
    order by expedition.settled_at, expedition.id
    limit safe_batch_size
  )
  delete from public.discord_fishing_expeditions as expedition
  where expedition.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('completed_fishing_expeditions', deleted_rows);

  return totals;
end;
$$;

revoke all on function public.prune_discord_companion_history(integer) from public;
grant execute on function public.prune_discord_companion_history(integer) to service_role;

do $discord_companion_retention_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-discord-companion-history'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-discord-companion-history',
      '5 * * * *',
      'select public.prune_discord_companion_history(500);'
    );
  else
    raise notice 'pg_cron is not enabled; see docs/data-retention.md to schedule Discord companion cleanup.';
  end if;
end;
$discord_companion_retention_cron$;

notify pgrst, 'reload schema';
