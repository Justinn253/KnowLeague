create table if not exists public.solo_quiz_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null,
  mode text not null,
  difficulty text not null,
  date_key date not null,
  item_count integer not null,
  item_ids text[] not null default '{}',
  completion_time_seconds integer not null,
  item_time_seconds numeric(8, 2) not null,
  wrong_guesses integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint solo_quiz_leaderboard_game_allowed check (game_id in ('ability-blitz', 'skin-champion')),
  constraint solo_quiz_leaderboard_mode_allowed check (mode in ('daily', 'chaos')),
  constraint solo_quiz_leaderboard_difficulty_allowed check (difficulty in ('iron', 'gold', 'diamond', 'challenger')),
  constraint solo_quiz_leaderboard_item_count_positive check (item_count > 0),
  constraint solo_quiz_leaderboard_completion_nonnegative check (completion_time_seconds >= 0),
  constraint solo_quiz_leaderboard_item_time_nonnegative check (item_time_seconds >= 0),
  constraint solo_quiz_leaderboard_wrong_guesses_nonnegative check (wrong_guesses >= 0)
);

create unique index if not exists solo_quiz_leaderboard_once_per_day_idx
  on public.solo_quiz_leaderboard_entries (user_id, game_id, mode, difficulty, date_key);

create index if not exists solo_quiz_leaderboard_rank_idx
  on public.solo_quiz_leaderboard_entries (game_id, mode, difficulty, date_key, completion_time_seconds, wrong_guesses, completed_at);

alter table public.solo_quiz_leaderboard_entries enable row level security;

drop policy if exists "Solo quiz leaderboards are readable by everyone" on public.solo_quiz_leaderboard_entries;
create policy "Solo quiz leaderboards are readable by everyone"
  on public.solo_quiz_leaderboard_entries for select
  using (true);

grant select on table public.solo_quiz_leaderboard_entries to anon, authenticated;
grant select, insert, update, delete on table public.solo_quiz_leaderboard_entries to service_role;
