begin;

-- A Discord member may keep one preferred Riot account per KnowLeague guild.
-- This is deliberately separate from the website's optional public profile
-- field: it is a bot-private convenience preference, not a second identity
-- link and never stores a Riot credential.
create table if not exists public.discord_linked_league_accounts (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  riot_id text not null check (char_length(riot_id) between 3 and 64),
  region text not null check (region in ('BR1', 'EUN1', 'EUW1', 'JP1', 'KR', 'LA1', 'LA2', 'NA1', 'OC1', 'TR1', 'RU', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

alter table public.discord_linked_league_accounts enable row level security;
revoke all on table public.discord_linked_league_accounts from anon, authenticated;
grant select, insert, update, delete on table public.discord_linked_league_accounts to service_role;

-- Administrators opt in to website-to-Discord Skindle result sharing by
-- selecting one already-synced, sendable text channel in Discord Configuration.
create table if not exists public.discord_skindle_share_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.discord_skindle_share_settings enable row level security;
revoke all on table public.discord_skindle_share_settings from anon, authenticated;
grant select, insert, update, delete on table public.discord_skindle_share_settings to service_role;

-- The website enqueues a completed game and the independently deployed bot
-- publishes it. The unique key makes refreshes, retries, and two browser tabs
-- idempotent for one player/day while keeping the bot token out of the web app.
create table if not exists public.discord_skindle_share_outbox (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  date_key date not null,
  guess_count integer not null check (guess_count between 1 and 100),
  progress_rows text[] not null check (cardinality(progress_rows) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'sent', 'discarded')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (guild_id, user_id, date_key)
);

create index if not exists discord_skindle_share_outbox_pending_idx
  on public.discord_skindle_share_outbox (guild_id, created_at asc)
  where status = 'pending';

alter table public.discord_skindle_share_outbox enable row level security;
revoke all on table public.discord_skindle_share_outbox from anon, authenticated;
grant select, insert, update, delete on table public.discord_skindle_share_outbox to service_role;

notify pgrst, 'reload schema';

commit;
