alter table public.profiles
  add column if not exists about_me text not null default '',
  add column if not exists friends_count integer not null default 0 check (friends_count >= 0),
  add column if not exists discord_username text,
  add column if not exists riot_account_name text;
