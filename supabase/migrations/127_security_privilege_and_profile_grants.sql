begin;

-- These functions are called only through server-side service-role code. Keep
-- them out of the public PostgREST RPC surface so callers cannot bypass the
-- API's authentication, rate limits, and validation.
revoke all on function public.record_riot_account_search(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_riot_account_search(text, text, text, text) to service_role;

revoke all on function public.get_or_create_splash_scramble_skin_solve(text) from public, anon, authenticated;
grant execute on function public.get_or_create_splash_scramble_skin_solve(text) to service_role;

revoke all on function public.record_splash_scramble_skin_solve(text) from public, anon, authenticated;
grant execute on function public.record_splash_scramble_skin_solve(text) to service_role;

revoke all on function public.get_splash_scramble_daily_leaderboard(date, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_splash_scramble_daily_leaderboard(date, uuid, integer) to service_role;

revoke all on function public.get_riot_account_popularity(text, integer) from public, anon, authenticated;
grant execute on function public.get_riot_account_popularity(text, integer) to service_role;

revoke all on function public.prune_riot_account_search_activity(integer) from public, anon, authenticated;
grant execute on function public.prune_riot_account_search_activity(integer) to service_role;

-- Username availability is intentionally used by guest and authenticated
-- signup/profile flows and returns only the public profile id and username.
revoke all on function public.find_profile_by_username_ci(text) from public, anon, authenticated;
grant execute on function public.find_profile_by_username_ci(text) to anon, authenticated, service_role;

-- Replace broad table privileges with a public-profile column allowlist. This
-- prevents legacy/private and operational columns from becoming selectable or
-- writable just because a later migration granted table-level access.
revoke select on table public.profiles from anon, authenticated;
grant select (
  id,
  username,
  display_name,
  about_me,
  avatar_url,
  created_at,
  friends_count,
  friend_requests_open,
  profile_visibility,
  profile_status,
  friends_list_public,
  chat_color,
  chat_border,
  selected_title_reward_id,
  displayed_badge_reward_ids
) on table public.profiles to anon, authenticated;

revoke update on table public.profiles from authenticated;
revoke update (
  friends_count,
  discord_username,
  riot_account_name,
  last_seen_at,
  active_session_id,
  is_banned,
  app_role
) on table public.profiles from authenticated;
grant update (
  username,
  display_name,
  avatar_url,
  updated_at,
  about_me,
  friend_requests_open,
  profile_visibility,
  profile_status,
  friends_list_public,
  chat_color,
  chat_border,
  selected_title_reward_id,
  displayed_badge_reward_ids
) on table public.profiles to authenticated;

revoke select (
  discord_username,
  riot_account_name,
  last_seen_at,
  active_session_id,
  is_banned,
  app_role
) on table public.profiles from anon, authenticated;

notify pgrst, 'reload schema';

commit;
