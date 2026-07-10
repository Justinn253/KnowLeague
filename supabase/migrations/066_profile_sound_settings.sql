alter table public.profile_private_details
  add column if not exists sound_settings jsonb;

notify pgrst, 'reload schema';
