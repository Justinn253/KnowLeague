alter table public.profiles
  add column if not exists app_role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_app_role_allowed;

alter table public.profiles
  add constraint profiles_app_role_allowed
  check (app_role in ('user', 'moderator'));

create index if not exists profiles_app_role_idx
  on public.profiles(app_role);

revoke update on table public.profiles from authenticated;

grant update (
  username,
  display_name,
  avatar_url,
  updated_at,
  about_me,
  friends_count,
  discord_username,
  riot_account_name,
  friend_requests_open,
  last_seen_at,
  active_session_id,
  chat_color,
  chat_border,
  selected_title_reward_id,
  displayed_badge_reward_ids
) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;

notify pgrst, 'reload schema';
