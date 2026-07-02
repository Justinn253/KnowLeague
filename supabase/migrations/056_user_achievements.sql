create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  progress_current integer not null default 0 check (progress_current >= 0),
  progress_target integer not null default 1 check (progress_target > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_achievement_completed_idx
  on public.user_achievements(achievement_id, completed_at)
  where completed_at is not null;

alter table public.user_achievements enable row level security;

drop policy if exists "Users can read their own achievements" on public.user_achievements;
create policy "Users can read their own achievements"
  on public.user_achievements
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.user_achievements to authenticated;
