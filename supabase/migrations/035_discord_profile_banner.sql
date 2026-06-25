alter table public.profile_private_details
  add column if not exists discord_banner_url text;
