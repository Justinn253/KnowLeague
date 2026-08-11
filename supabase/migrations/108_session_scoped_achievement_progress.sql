alter table public.user_achievements
  add column if not exists progress_scope_key text;
