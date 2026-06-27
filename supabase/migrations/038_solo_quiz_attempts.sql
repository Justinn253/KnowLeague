create table if not exists public.solo_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null,
  mode text not null,
  difficulty text not null,
  date_key date not null,
  total_items integer not null default 0,
  item_ids text[] not null default '{}',
  completed_items integer not null default 0,
  elapsed_seconds integer not null default 0,
  wrong_guesses integer not null default 0,
  result text not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint solo_quiz_attempts_game_allowed check (game_id in ('ability-blitz', 'skin-champion')),
  constraint solo_quiz_attempts_mode_allowed check (mode in ('daily', 'chaos')),
  constraint solo_quiz_attempts_difficulty_allowed check (difficulty in ('iron', 'gold', 'diamond', 'challenger')),
  constraint solo_quiz_attempts_result_allowed check (result in ('active', 'completed', 'failed', 'abandoned')),
  constraint solo_quiz_attempts_total_items_nonnegative check (total_items >= 0),
  constraint solo_quiz_attempts_completed_items_nonnegative check (completed_items >= 0),
  constraint solo_quiz_attempts_elapsed_nonnegative check (elapsed_seconds >= 0),
  constraint solo_quiz_attempts_wrong_guesses_nonnegative check (wrong_guesses >= 0)
);

create unique index if not exists solo_quiz_attempts_once_per_day_idx
  on public.solo_quiz_attempts (user_id, game_id, mode, difficulty, date_key);

create index if not exists solo_quiz_attempts_daily_count_idx
  on public.solo_quiz_attempts (game_id, mode, difficulty, date_key);

create index if not exists solo_quiz_attempts_chaos_rank_idx
  on public.solo_quiz_attempts (game_id, mode, difficulty, date_key, completed_items desc, elapsed_seconds asc, wrong_guesses asc, updated_at asc);

alter table public.solo_quiz_attempts enable row level security;

drop policy if exists "Solo quiz attempts are readable by everyone" on public.solo_quiz_attempts;
create policy "Solo quiz attempts are readable by everyone"
  on public.solo_quiz_attempts for select
  using (true);

grant select on table public.solo_quiz_attempts to anon, authenticated;
grant select, insert, update, delete on table public.solo_quiz_attempts to service_role;
