create table if not exists public.splash_scramble_daily_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date_key date not null,
  moves integer not null check (moves >= 0),
  completion_time_seconds integer not null check (completion_time_seconds >= 0),
  completion_score integer not null check (completion_score >= 0),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists splash_scramble_daily_leaderboard_first_score_idx
  on public.splash_scramble_daily_leaderboard_entries (user_id, date_key);

create index if not exists splash_scramble_daily_leaderboard_rank_idx
  on public.splash_scramble_daily_leaderboard_entries (date_key, completion_score desc, moves asc, completion_time_seconds asc, completed_at asc);

alter table public.splash_scramble_daily_leaderboard_entries enable row level security;

drop policy if exists "Splash Scramble daily leaderboard is readable by everyone" on public.splash_scramble_daily_leaderboard_entries;
create policy "Splash Scramble daily leaderboard is readable by everyone"
  on public.splash_scramble_daily_leaderboard_entries for select
  using (true);

grant select on table public.splash_scramble_daily_leaderboard_entries to anon, authenticated;
grant select, insert, update, delete on table public.splash_scramble_daily_leaderboard_entries to service_role;

create sequence if not exists public.splash_scramble_skin_key_seq
  as integer
  minvalue 10000
  maxvalue 99999
  start with 10000;

create table if not exists public.splash_scramble_skin_solves (
  skin_key text primary key default lpad(nextval('public.splash_scramble_skin_key_seq'::regclass)::text, 5, '0'),
  skin_id text not null unique,
  solve_count integer not null default 0 check (solve_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint splash_scramble_skin_solves_key_format check (skin_key ~ '^[0-9]{5}$')
);

create index if not exists splash_scramble_skin_solves_count_idx
  on public.splash_scramble_skin_solves (solve_count desc);

alter table public.splash_scramble_skin_solves enable row level security;

drop policy if exists "Splash Scramble skin solves are readable by everyone" on public.splash_scramble_skin_solves;
create policy "Splash Scramble skin solves are readable by everyone"
  on public.splash_scramble_skin_solves for select
  using (true);

grant select on table public.splash_scramble_skin_solves to anon, authenticated;
grant select, insert, update, delete on table public.splash_scramble_skin_solves to service_role;

create or replace function public.get_or_create_splash_scramble_skin_solve(p_skin_id text)
returns table (skin_key text, solve_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_skin_id text := trim(p_skin_id);
begin
  if normalized_skin_id = '' then
    raise exception 'skin_id is required';
  end if;

  insert into public.splash_scramble_skin_solves (skin_id)
  values (normalized_skin_id)
  on conflict (skin_id) do nothing;

  return query
  select solves.skin_key, solves.solve_count
  from public.splash_scramble_skin_solves as solves
  where solves.skin_id = normalized_skin_id;
end;
$$;

create or replace function public.record_splash_scramble_skin_solve(p_skin_id text)
returns table (skin_key text, solve_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_skin_id text := trim(p_skin_id);
begin
  if normalized_skin_id = '' then
    raise exception 'skin_id is required';
  end if;

  perform public.get_or_create_splash_scramble_skin_solve(normalized_skin_id);

  return query
  update public.splash_scramble_skin_solves as solves
  set
    solve_count = solves.solve_count + 1,
    updated_at = now()
  where solves.skin_id = normalized_skin_id
  returning solves.skin_key, solves.solve_count;
end;
$$;

create or replace function public.get_splash_scramble_daily_leaderboard(
  p_date_key date,
  p_user_id uuid default null,
  p_limit integer default 50
)
returns table (
  entry_id uuid,
  user_id uuid,
  rank_position integer,
  username text,
  display_name text,
  chat_color text,
  moves integer,
  completion_time_seconds integer,
  completion_score integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked_entries as (
    select
      entry.id as entry_id,
      entry.user_id,
      row_number() over (
        order by entry.completion_score desc, entry.moves asc, entry.completion_time_seconds asc, entry.completed_at asc
      )::integer as rank_position,
      profile.username,
      coalesce(profile.display_name, profile.username) as display_name,
      coalesce(profile.chat_color, 'amber') as chat_color,
      entry.moves,
      entry.completion_time_seconds,
      entry.completion_score,
      entry.completed_at
    from public.splash_scramble_daily_leaderboard_entries as entry
    join public.profiles as profile on profile.id = entry.user_id
    where entry.date_key = p_date_key
  )
  select *
  from ranked_entries
  where rank_position <= greatest(1, least(coalesce(p_limit, 50), 50))
    or (p_user_id is not null and user_id = p_user_id)
  order by rank_position;
$$;

grant execute on function public.get_or_create_splash_scramble_skin_solve(text) to service_role;
grant execute on function public.record_splash_scramble_skin_solve(text) to service_role;
grant execute on function public.get_splash_scramble_daily_leaderboard(date, uuid, integer) to service_role;

notify pgrst, 'reload schema';
