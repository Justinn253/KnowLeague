create table if not exists public.riot_account_search_totals (
  riot_id_normalized text not null,
  platform text not null,
  riot_id text not null,
  game_name text not null,
  tag_line text not null,
  search_count bigint not null default 1 check (search_count >= 1),
  last_searched_at timestamptz not null default now(),
  primary key (riot_id_normalized, platform)
);

create index if not exists riot_account_search_totals_popularity_idx
  on public.riot_account_search_totals (search_count desc, last_searched_at desc);

create table if not exists public.riot_account_search_activity (
  riot_id_normalized text not null,
  platform text not null,
  riot_id text not null,
  game_name text not null,
  tag_line text not null,
  search_date date not null default current_date,
  search_count integer not null default 1 check (search_count >= 1),
  last_searched_at timestamptz not null default now(),
  primary key (riot_id_normalized, platform, search_date)
);

create index if not exists riot_account_search_activity_period_idx
  on public.riot_account_search_activity (search_date, search_count desc, last_searched_at desc);

alter table public.riot_account_search_totals enable row level security;
alter table public.riot_account_search_activity enable row level security;

revoke all on table public.riot_account_search_totals from anon, authenticated;
revoke all on table public.riot_account_search_activity from anon, authenticated;
grant select, insert, update, delete on table public.riot_account_search_totals to service_role;
grant select, insert, update, delete on table public.riot_account_search_activity to service_role;

insert into public.riot_account_search_totals (
  riot_id_normalized,
  platform,
  riot_id,
  game_name,
  tag_line,
  search_count,
  last_searched_at
)
select
  riot_id_normalized,
  upper(platform),
  riot_id,
  game_name,
  tag_line,
  search_count,
  last_searched_at
from public.riot_account_searches
on conflict (riot_id_normalized, platform) do nothing;

create or replace function public.record_riot_account_search(
  search_riot_id text,
  search_game_name text,
  search_tag_line text,
  search_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.riot_account_searches (
    riot_id,
    riot_id_normalized,
    game_name,
    tag_line,
    platform,
    search_count,
    first_searched_at,
    last_searched_at
  )
  values (
    search_riot_id,
    lower(search_riot_id),
    search_game_name,
    search_tag_line,
    upper(search_platform),
    1,
    now(),
    now()
  )
  on conflict (riot_id_normalized, platform)
  do update set
    riot_id = excluded.riot_id,
    game_name = excluded.game_name,
    tag_line = excluded.tag_line,
    platform = excluded.platform,
    search_count = public.riot_account_searches.search_count + 1,
    last_searched_at = now();

  insert into public.riot_account_search_totals (
    riot_id_normalized,
    platform,
    riot_id,
    game_name,
    tag_line,
    search_count,
    last_searched_at
  )
  values (
    lower(search_riot_id),
    upper(search_platform),
    search_riot_id,
    search_game_name,
    search_tag_line,
    1,
    now()
  )
  on conflict (riot_id_normalized, platform)
  do update set
    riot_id = excluded.riot_id,
    game_name = excluded.game_name,
    tag_line = excluded.tag_line,
    search_count = public.riot_account_search_totals.search_count + 1,
    last_searched_at = now();

  insert into public.riot_account_search_activity (
    riot_id_normalized,
    platform,
    riot_id,
    game_name,
    tag_line,
    search_date,
    search_count,
    last_searched_at
  )
  values (
    lower(search_riot_id),
    upper(search_platform),
    search_riot_id,
    search_game_name,
    search_tag_line,
    current_date,
    1,
    now()
  )
  on conflict (riot_id_normalized, platform, search_date)
  do update set
    riot_id = excluded.riot_id,
    game_name = excluded.game_name,
    tag_line = excluded.tag_line,
    search_count = public.riot_account_search_activity.search_count + 1,
    last_searched_at = now();
end;
$$;

grant execute on function public.record_riot_account_search(text, text, text, text) to service_role;

create or replace function public.get_riot_account_popularity(
  search_period text,
  search_limit integer default 10
)
returns table (
  riot_id text,
  platform text,
  search_count bigint,
  last_searched_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with period_results as (
    select
      totals.riot_id,
      totals.platform,
      totals.search_count,
      totals.last_searched_at
    from public.riot_account_search_totals as totals
    where search_period = 'all_time'

    union all

    select
      activity.riot_id,
      activity.platform,
      sum(activity.search_count)::bigint as search_count,
      max(activity.last_searched_at) as last_searched_at
    from public.riot_account_search_activity as activity
    where search_period <> 'all_time'
      and (
        (search_period = 'day' and activity.search_date >= current_date)
        or (search_period = 'week' and activity.search_date >= current_date - 6)
        or (search_period = 'month' and activity.search_date >= current_date - 29)
      )
    group by activity.riot_id, activity.platform
  )
  select
    period_results.riot_id,
    period_results.platform,
    period_results.search_count,
    period_results.last_searched_at
  from period_results
  order by period_results.search_count desc, period_results.last_searched_at desc
  limit least(greatest(coalesce(search_limit, 10), 1), 50);
$$;

revoke all on function public.get_riot_account_popularity(text, integer) from public;
grant execute on function public.get_riot_account_popularity(text, integer) to service_role;

create or replace function public.prune_riot_account_search_activity(p_batch_size integer default 5000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 5000), 10000));
  deleted_rows integer;
begin
  with candidates as (
    select activity.riot_id_normalized, activity.platform, activity.search_date
    from public.riot_account_search_activity as activity
    where activity.search_date < current_date - 400
    order by activity.search_date
    limit safe_batch_size
  )
  delete from public.riot_account_search_activity as activity
  where (activity.riot_id_normalized, activity.platform, activity.search_date) in (
    select riot_id_normalized, platform, search_date from candidates
  );

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke all on function public.prune_riot_account_search_activity(integer) from public;
grant execute on function public.prune_riot_account_search_activity(integer) to service_role;

do $search_popularity_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'knowleague-prune-riot-account-search-activity'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'knowleague-prune-riot-account-search-activity',
      '50 4 * * *',
      'select public.prune_riot_account_search_activity(5000);'
    );
  else
    raise notice 'pg_cron is not enabled; schedule public.prune_riot_account_search_activity(5000) separately.';
  end if;
end;
$search_popularity_cron$;

notify pgrst, 'reload schema';
