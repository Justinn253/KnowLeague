alter table public.profile_private_details
  add column if not exists player_game_stats_reset_at jsonb not null default '{}'::jsonb,
  add column if not exists detailed_game_stats jsonb,
  add column if not exists detailed_game_stats_reset_at jsonb not null default '{}'::jsonb;

create table if not exists public.profile_admin_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  staff_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'ban',
    'unban',
    'unlink_discord',
    'unlink_riot',
    'reset_stats',
    'grant_achievement',
    'revoke_achievement',
    'reset_achievements'
  )),
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profile_admin_actions_target_idx
  on public.profile_admin_actions(target_user_id, created_at desc);

create index if not exists profile_admin_actions_staff_idx
  on public.profile_admin_actions(staff_user_id, created_at desc);

alter table public.profile_admin_actions enable row level security;

grant select, insert on table public.profile_admin_actions to service_role;

notify pgrst, 'reload schema';
