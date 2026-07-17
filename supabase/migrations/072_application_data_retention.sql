-- Retention is deliberately batched so an hourly run cannot hold long-lived locks.
-- Enable the Supabase Cron integration before applying this migration to schedule it.

create index if not exists friend_messages_created_at_idx
  on public.friend_messages (created_at);

create index if not exists friend_requests_status_updated_at_idx
  on public.friend_requests (status, updated_at);

create index if not exists riot_account_searches_last_searched_at_idx
  on public.riot_account_searches (last_searched_at);

create index if not exists riot_account_profile_metrics_last_searched_at_idx
  on public.riot_account_profile_metrics (last_searched_at);

create index if not exists solo_quiz_attempts_date_key_idx
  on public.solo_quiz_attempts (date_key);

create index if not exists solo_quiz_leaderboard_entries_date_key_idx
  on public.solo_quiz_leaderboard_entries (date_key);

create index if not exists splash_scramble_daily_leaderboard_date_key_idx
  on public.splash_scramble_daily_leaderboard_entries (date_key);

create index if not exists contact_submissions_retention_idx
  on public.contact_submissions (status, category, severity, created_at);

create index if not exists multiplayer_quiz_lobbies_retention_idx
  on public.multiplayer_quiz_lobbies (status, created_at);

create index if not exists skincognito_lobbies_retention_idx
  on public.skincognito_lobbies (status, created_at);

create index if not exists carving_revelation_lobbies_retention_idx
  on public.carving_revelation_lobbies (status, created_at);

create index if not exists category_clash_lobbies_retention_idx
  on public.category_clash_lobbies (status, created_at);

create or replace function public.prune_application_data(p_batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 500), 1000));
  lobby_batch_size integer;
  deleted_rows integer;
  totals jsonb := '{}'::jsonb;
begin
  lobby_batch_size := least(safe_batch_size, 100);

  -- Deleting a lobby cascades its players, actions/submissions, events, chat, bans, and votes.
  with candidates as (
    select lobby.id
    from public.multiplayer_quiz_lobbies as lobby
    where (lobby.status = 'waiting' and lobby.created_at < now() - interval '2 days')
      or (
        lobby.status = 'terminated'
        and coalesce(lobby.terminated_at, lobby.updated_at, lobby.created_at) < now() - interval '30 days'
      )
    order by lobby.created_at
    limit lobby_batch_size
  )
  delete from public.multiplayer_quiz_lobbies as lobby
  where lobby.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('multiplayer_quiz_lobbies', deleted_rows);

  with candidates as (
    select lobby.id
    from public.skincognito_lobbies as lobby
    where (lobby.status = 'waiting' and lobby.created_at < now() - interval '2 days')
      or (
        lobby.status in ('finished', 'terminated')
        and coalesce(lobby.finished_at, lobby.terminated_at, lobby.updated_at, lobby.created_at) < now() - interval '30 days'
      )
      or (
        lobby.status = 'active'
        and lobby.created_at < now() - interval '7 days'
        and not exists (
          select 1
          from public.skincognito_players as player
          where player.lobby_id = lobby.id
            and player.last_seen_at >= now() - interval '1 day'
        )
      )
    order by lobby.created_at
    limit lobby_batch_size
  )
  delete from public.skincognito_lobbies as lobby
  where lobby.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('skincognito_lobbies', deleted_rows);

  with candidates as (
    select lobby.id
    from public.carving_revelation_lobbies as lobby
    where (lobby.status = 'waiting' and lobby.created_at < now() - interval '2 days')
      or (
        lobby.status in ('finished', 'terminated')
        and coalesce(lobby.finished_at, lobby.terminated_at, lobby.updated_at, lobby.created_at) < now() - interval '30 days'
      )
      or (
        lobby.status = 'active'
        and lobby.created_at < now() - interval '7 days'
        and not exists (
          select 1
          from public.carving_revelation_players as player
          where player.lobby_id = lobby.id
            and player.last_seen_at >= now() - interval '1 day'
        )
      )
    order by lobby.created_at
    limit lobby_batch_size
  )
  delete from public.carving_revelation_lobbies as lobby
  where lobby.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('carving_revelation_lobbies', deleted_rows);

  with candidates as (
    select lobby.id
    from public.category_clash_lobbies as lobby
    where (lobby.status = 'waiting' and lobby.created_at < now() - interval '2 days')
      or (
        lobby.status in ('finished', 'terminated')
        and coalesce(lobby.finished_at, lobby.terminated_at, lobby.updated_at, lobby.created_at) < now() - interval '30 days'
      )
      or (
        lobby.status = 'active'
        and lobby.created_at < now() - interval '7 days'
        and not exists (
          select 1
          from public.category_clash_players as player
          where player.lobby_id = lobby.id
            and player.last_seen_at >= now() - interval '1 day'
        )
      )
    order by lobby.created_at
    limit lobby_batch_size
  )
  delete from public.category_clash_lobbies as lobby
  where lobby.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('category_clash_lobbies', deleted_rows);

  with candidates as (
    select message.id
    from public.friend_messages as message
    where message.created_at < now() - interval '30 days'
    order by message.created_at
    limit safe_batch_size
  )
  delete from public.friend_messages as message
  where message.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('friend_messages', deleted_rows);

  with candidates as (
    select request.id
    from public.friend_requests as request
    where (request.status = 'pending' and request.created_at < now() - interval '30 days')
      or (request.status <> 'pending' and request.updated_at < now() - interval '90 days')
    order by request.updated_at
    limit safe_batch_size
  )
  delete from public.friend_requests as request
  where request.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('friend_requests', deleted_rows);

  with candidates as (
    select search.id
    from public.riot_account_searches as search
    where search.last_searched_at < now() - interval '180 days'
    order by search.last_searched_at
    limit safe_batch_size
  )
  delete from public.riot_account_searches as search
  where search.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('riot_account_searches', deleted_rows);

  with candidates as (
    select metrics.puuid, metrics.platform
    from public.riot_account_profile_metrics as metrics
    where metrics.last_searched_at < now() - interval '180 days'
    order by metrics.last_searched_at
    limit safe_batch_size
  )
  delete from public.riot_account_profile_metrics as metrics
  where (metrics.puuid, metrics.platform) in (select puuid, platform from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('riot_account_profile_metrics', deleted_rows);

  with candidates as (
    select attempt.id
    from public.solo_quiz_attempts as attempt
    where attempt.date_key < current_date - 45
    order by attempt.date_key
    limit safe_batch_size
  )
  delete from public.solo_quiz_attempts as attempt
  where attempt.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('solo_quiz_attempts', deleted_rows);

  with candidates as (
    select entry.id
    from public.solo_quiz_leaderboard_entries as entry
    where entry.date_key < current_date - 120
    order by entry.date_key
    limit safe_batch_size
  )
  delete from public.solo_quiz_leaderboard_entries as entry
  where entry.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('solo_quiz_leaderboard_entries', deleted_rows);

  with candidates as (
    select entry.id
    from public.splash_scramble_daily_leaderboard_entries as entry
    where entry.date_key < current_date - 120
    order by entry.date_key
    limit safe_batch_size
  )
  delete from public.splash_scramble_daily_leaderboard_entries as entry
  where entry.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('splash_scramble_daily_leaderboard_entries', deleted_rows);

  -- Keep unresolved and player-report records. Product/legal owners must set a separate policy for those.
  with candidates as (
    select submission.id
    from public.contact_submissions as submission
    where submission.status in ('closed', 'archived')
      and submission.category in ('feedback', 'bug_report', 'suggestion')
      and submission.severity <= 2
      and submission.created_at < now() - interval '365 days'
    order by submission.created_at
    limit safe_batch_size
  )
  delete from public.contact_submissions as submission
  where submission.id in (select id from candidates);
  get diagnostics deleted_rows = row_count;
  totals := totals || jsonb_build_object('closed_low_severity_contact_submissions', deleted_rows);

  return totals;
end;
$$;

revoke all on function public.prune_application_data(integer) from public;
grant execute on function public.prune_application_data(integer) to service_role;

do $retention_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname in ('knowleague-prune-application-data', 'knowleague-prune-cron-history')
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-application-data',
      '15 * * * *',
      'select public.prune_application_data(500);'
    );

    -- pg_cron retains its own execution history unless it is explicitly pruned.
    perform cron.schedule(
      'knowleague-prune-cron-history',
      '45 4 * * 0',
      'delete from cron.job_run_details where start_time < now() - interval ''30 days'';'
    );
  else
    raise notice 'pg_cron is not enabled; see docs/data-retention.md to schedule application cleanup.';
  end if;
end;
$retention_cron$;

notify pgrst, 'reload schema';
