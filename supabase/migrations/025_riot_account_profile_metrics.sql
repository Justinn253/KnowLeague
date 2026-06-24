create table if not exists public.riot_account_profile_metrics (
  puuid text not null,
  platform text not null,
  riot_id text not null,
  riot_id_normalized text not null,
  summoner_level integer not null default 0,
  total_mastery_points integer not null default 0,
  challenge_points integer not null default 0,
  solo_rank_score integer,
  flex_rank_score integer,
  last_searched_at timestamptz not null default now(),
  primary key (puuid, platform)
);

create index if not exists riot_account_profile_metrics_mastery_idx
  on public.riot_account_profile_metrics (total_mastery_points desc);

create index if not exists riot_account_profile_metrics_challenge_idx
  on public.riot_account_profile_metrics (challenge_points desc);

create index if not exists riot_account_profile_metrics_solo_rank_idx
  on public.riot_account_profile_metrics (platform, solo_rank_score desc)
  where solo_rank_score is not null;

create index if not exists riot_account_profile_metrics_flex_rank_idx
  on public.riot_account_profile_metrics (platform, flex_rank_score desc)
  where flex_rank_score is not null;

alter table public.riot_account_profile_metrics enable row level security;

grant select, insert, update, delete on table public.riot_account_profile_metrics to service_role;
