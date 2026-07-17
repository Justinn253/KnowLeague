create table if not exists public.riot_account_profile_snapshots (
  puuid text not null,
  platform text not null,
  riot_id text not null,
  riot_id_normalized text not null,
  profile_payload text not null,
  current_game_payload text,
  payload_encoding text not null default 'gzip+base64',
  fetched_at timestamptz not null default now(),
  current_game_fetched_at timestamptz,
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  primary key (puuid, platform),
  constraint riot_account_profile_snapshots_platform_check
    check (platform = upper(platform)),
  constraint riot_account_profile_snapshots_encoding_check
    check (payload_encoding = 'gzip+base64')
);

create unique index if not exists riot_account_profile_snapshots_riot_id_idx
  on public.riot_account_profile_snapshots (platform, riot_id_normalized);

create index if not exists riot_account_profile_snapshots_last_accessed_idx
  on public.riot_account_profile_snapshots (last_accessed_at);

create index if not exists riot_account_profile_snapshots_expires_at_idx
  on public.riot_account_profile_snapshots (expires_at);

alter table public.riot_account_profile_snapshots enable row level security;

revoke all on table public.riot_account_profile_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.riot_account_profile_snapshots to service_role;

create or replace function public.prune_riot_account_profile_snapshots(p_batch_size integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 500), 1000));
  deleted_rows integer;
begin
  with candidates as (
    select snapshot.puuid, snapshot.platform
    from public.riot_account_profile_snapshots as snapshot
    where snapshot.last_accessed_at < now() - interval '30 days'
    order by snapshot.last_accessed_at
    limit safe_batch_size
  )
  delete from public.riot_account_profile_snapshots as snapshot
  where (snapshot.puuid, snapshot.platform) in (select puuid, platform from candidates);

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.prune_riot_account_profile_snapshots(integer) from public;
grant execute on function public.prune_riot_account_profile_snapshots(integer) to service_role;

do $snapshot_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-riot-profile-snapshots'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-riot-profile-snapshots',
      '30 * * * *',
      'select public.prune_riot_account_profile_snapshots(500);'
    );
  else
    raise notice 'pg_cron is not enabled; schedule public.prune_riot_account_profile_snapshots(500) separately.';
  end if;
end;
$snapshot_cron$;

notify pgrst, 'reload schema';
