alter table public.profiles
  drop constraint if exists profiles_displayed_badge_reward_ids_check;

update public.profiles
set displayed_badge_reward_ids = coalesce(displayed_badge_reward_ids[1:8], '{}');

alter table public.profiles
  add constraint profiles_displayed_badge_reward_ids_check
  check (cardinality(displayed_badge_reward_ids) <= 8);

notify pgrst, 'reload schema';
