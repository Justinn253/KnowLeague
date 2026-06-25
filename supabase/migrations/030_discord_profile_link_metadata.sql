alter table public.profile_private_details
  add column if not exists discord_user_id text,
  add column if not exists discord_avatar_url text;
