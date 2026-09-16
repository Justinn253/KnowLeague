-- Store short-lived Randodraft share payloads behind compact reference URLs.
create table if not exists public.randodraft_shares (
  id uuid primary key default gen_random_uuid(),
  draft jsonb not null,
  completed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists randodraft_shares_expires_at_idx
  on public.randodraft_shares (expires_at);

alter table public.randodraft_shares enable row level security;
revoke all on table public.randodraft_shares from public, anon, authenticated;

create or replace function public.prune_randodraft_shares()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.randodraft_shares
    where expires_at <= now()
    returning id
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.prune_randodraft_shares() from public, anon, authenticated;
grant execute on function public.prune_randodraft_shares() to service_role;

do $randodraft_share_cron$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job_id
      from cron.job
      where jobname = 'knowleague-prune-randodraft-shares'
      limit 1;
    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;
    perform cron.schedule(
      'knowleague-prune-randodraft-shares',
      '15 * * * *',
      $$select public.prune_randodraft_shares();$$
    );
  end if;
end;
$randodraft_share_cron$;
