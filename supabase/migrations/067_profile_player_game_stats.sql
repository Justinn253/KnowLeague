alter table public.profile_private_details
  add column if not exists player_game_stats jsonb;

notify pgrst, 'reload schema';
