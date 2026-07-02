alter table public.profiles
  add column if not exists selected_title_reward_id text,
  add column if not exists displayed_badge_reward_ids text[] not null default '{}' check (cardinality(displayed_badge_reward_ids) <= 9);

notify pgrst, 'reload schema';
