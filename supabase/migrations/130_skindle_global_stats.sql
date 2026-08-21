create table if not exists public.skindle_daily_stats (
  date_key date primary key,
  total_guesses bigint not null default 0 check (total_guesses >= 0),
  correct_guesses bigint not null default 0 check (correct_guesses >= 0),
  total_winning_guesses bigint not null default 0 check (total_winning_guesses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skindle_daily_skin_guesses (
  date_key date not null references public.skindle_daily_stats(date_key) on delete cascade,
  skin_id text not null,
  answer text not null,
  guess_count bigint not null default 0 check (guess_count >= 0),
  first_client_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date_key, skin_id)
);

create index if not exists skindle_daily_skin_guesses_rank_idx
  on public.skindle_daily_skin_guesses (date_key, guess_count desc, answer asc);

create table if not exists public.skindle_daily_clients (
  date_key date not null references public.skindle_daily_stats(date_key) on delete cascade,
  client_id text not null,
  guess_ids text[] not null default '{}'::text[],
  solved boolean not null default false,
  solved_guess_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date_key, client_id)
);

alter table public.skindle_daily_stats enable row level security;
alter table public.skindle_daily_skin_guesses enable row level security;
alter table public.skindle_daily_clients enable row level security;

revoke all on table public.skindle_daily_stats from anon, authenticated;
revoke all on table public.skindle_daily_skin_guesses from anon, authenticated;
revoke all on table public.skindle_daily_clients from anon, authenticated;
grant select, insert, update, delete on table public.skindle_daily_stats to service_role;
grant select, insert, update, delete on table public.skindle_daily_skin_guesses to service_role;
grant select, insert, update, delete on table public.skindle_daily_clients to service_role;

create or replace function public.get_skindle_daily_stats(
  p_date_key date,
  p_include_top_guesses boolean default true
)
returns table (
  date_key date,
  total_guesses bigint,
  correct_guesses bigint,
  average_guesses_to_solve numeric,
  top_guesses jsonb,
  guesses_by_skin jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p_date_key,
    coalesce(daily.total_guesses, 0::bigint),
    coalesce(daily.correct_guesses, 0::bigint),
    case
      when coalesce(daily.correct_guesses, 0::bigint) > 0
        then coalesce(daily.total_winning_guesses, 0::bigint)::numeric / daily.correct_guesses
      else 0::numeric
    end,
    case
      when coalesce(p_include_top_guesses, true) then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'skinId', ranked.skin_id,
            'answer', ranked.answer,
            'count', ranked.guess_count
          )
          order by ranked.guess_count desc, ranked.answer asc
        )
        from (
          select skin_id, answer, guess_count
          from public.skindle_daily_skin_guesses
          where date_key = p_date_key
          order by guess_count desc, answer asc
          limit 10
        ) as ranked
      ), '[]'::jsonb)
      else '[]'::jsonb
    end,
    coalesce((
      select jsonb_object_agg(skin_id, guess_count)
      from public.skindle_daily_skin_guesses
      where date_key = p_date_key
    ), '{}'::jsonb)
  from (select 1) as anchor
  left join public.skindle_daily_stats as daily on daily.date_key = p_date_key;
$$;

create or replace function public.record_skindle_guess(
  p_date_key date,
  p_client_id text,
  p_skin_id text,
  p_answer text,
  p_is_correct boolean
)
returns table (
  date_key date,
  total_guesses bigint,
  correct_guesses bigint,
  average_guesses_to_solve numeric,
  top_guesses jsonb,
  guesses_by_skin jsonb,
  accepted boolean,
  first_for_skin boolean,
  client_already_solved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_client_id text := trim(coalesce(p_client_id, ''));
  normalized_skin_id text := trim(coalesce(p_skin_id, ''));
  normalized_answer text := trim(coalesce(p_answer, ''));
  stored_guess_ids text[];
  stored_solved boolean;
  next_guess_count integer;
  stored_skin_count bigint;
  stored_first_client_id text;
  was_accepted boolean := false;
  was_first_for_skin boolean := false;
  was_already_solved boolean := false;
begin
  if p_date_key is null or normalized_client_id = '' or normalized_skin_id = '' or normalized_answer = '' then
    raise exception 'date_key, client_id, skin_id, and answer are required';
  end if;

  insert into public.skindle_daily_stats (date_key)
  values (p_date_key)
  on conflict (date_key) do nothing;

  insert into public.skindle_daily_clients (date_key, client_id)
  values (p_date_key, normalized_client_id)
  on conflict (date_key, client_id) do nothing;

  select clients.guess_ids, clients.solved
  into stored_guess_ids, stored_solved
  from public.skindle_daily_clients as clients
  where clients.date_key = p_date_key
    and clients.client_id = normalized_client_id
  for update;

  was_already_solved := stored_solved;

  if not stored_solved and not (normalized_skin_id = any(stored_guess_ids)) then
    was_accepted := true;
    next_guess_count := cardinality(stored_guess_ids) + 1;

    update public.skindle_daily_clients
    set
      guess_ids = array_append(stored_guess_ids, normalized_skin_id),
      solved = coalesce(p_is_correct, false),
      solved_guess_count = case when coalesce(p_is_correct, false) then next_guess_count else solved_guess_count end,
      updated_at = now()
    where date_key = p_date_key
      and client_id = normalized_client_id;

    insert into public.skindle_daily_skin_guesses (
      date_key,
      skin_id,
      answer,
      guess_count,
      first_client_id
    )
    values (p_date_key, normalized_skin_id, normalized_answer, 1, normalized_client_id)
    on conflict (date_key, skin_id)
    do update set
      answer = excluded.answer,
      guess_count = public.skindle_daily_skin_guesses.guess_count + 1,
      updated_at = now()
    returning guess_count, first_client_id
    into stored_skin_count, stored_first_client_id;

    was_first_for_skin := stored_skin_count = 1 and stored_first_client_id = normalized_client_id;

    update public.skindle_daily_stats
    set
      total_guesses = total_guesses + 1,
      correct_guesses = correct_guesses + case when coalesce(p_is_correct, false) then 1 else 0 end,
      total_winning_guesses = total_winning_guesses + case when coalesce(p_is_correct, false) then next_guess_count else 0 end,
      updated_at = now()
    where date_key = p_date_key;
  end if;

  return query
  select
    snapshot.date_key,
    snapshot.total_guesses,
    snapshot.correct_guesses,
    snapshot.average_guesses_to_solve,
    snapshot.top_guesses,
    snapshot.guesses_by_skin,
    was_accepted,
    was_first_for_skin,
    was_already_solved
  from public.get_skindle_daily_stats(p_date_key, coalesce(p_is_correct, false)) as snapshot;
end;
$$;

revoke all on function public.get_skindle_daily_stats(date, boolean) from public;
revoke all on function public.record_skindle_guess(date, text, text, text, boolean) from public;
grant execute on function public.get_skindle_daily_stats(date, boolean) to service_role;
grant execute on function public.record_skindle_guess(date, text, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
