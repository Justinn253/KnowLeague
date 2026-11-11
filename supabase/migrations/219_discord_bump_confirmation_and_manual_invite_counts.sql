-- Keep only one visible bump-confirmation post and provide a private,
-- administrator-controlled starting invite total when an external export is
-- unavailable.

begin;

alter table public.discord_leveling_settings
  add column if not exists disboard_bump_confirmation_message_id text
    check (disboard_bump_confirmation_message_id is null or disboard_bump_confirmation_message_id ~ '^[0-9]{17,20}$');

create or replace function public.record_disboard_bump_reminder_v2(
  p_guild_id text,
  p_source_message_id text,
  p_bumped_at timestamptz,
  p_reminder_due_at timestamptz
)
returns table (recorded boolean, previous_confirmation_message_id text)
language plpgsql security definer set search_path = public
as $$
declare
  v_recorded boolean := false;
  v_previous_confirmation_message_id text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_source_message_id !~ '^[0-9]{17,20}$'
    or p_bumped_at is null or p_reminder_due_at is null or p_reminder_due_at <= p_bumped_at then
    raise exception 'DISBOARD bump reminder data is invalid.';
  end if;

  insert into public.discord_disboard_bump_events (
    guild_id, source_message_id, bumped_at, reminder_due_at
  ) values (
    p_guild_id, p_source_message_id, p_bumped_at, p_reminder_due_at
  ) on conflict (guild_id, source_message_id) do nothing
  returning true into v_recorded;

  if not coalesce(v_recorded, false) then
    return query select false, null::text;
    return;
  end if;

  select disboard_bump_confirmation_message_id into v_previous_confirmation_message_id
  from public.discord_leveling_settings
  where guild_id = p_guild_id
  for update;

  update public.discord_leveling_settings
  set disboard_bump_reminder_due_at = p_reminder_due_at,
      disboard_bump_reminder_source_message_id = p_source_message_id,
      disboard_bump_confirmation_message_id = null
  where guild_id = p_guild_id;

  return query select true, v_previous_confirmation_message_id;
end;
$$;

create or replace function public.attach_disboard_bump_confirmation(
  p_guild_id text,
  p_source_message_id text,
  p_confirmation_message_id text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_attached boolean := false;
begin
  update public.discord_leveling_settings
  set disboard_bump_confirmation_message_id = p_confirmation_message_id
  where guild_id = p_guild_id
    and disboard_bump_reminder_source_message_id = p_source_message_id
  returning true into v_attached;
  return coalesce(v_attached, false);
end;
$$;

create or replace function public.set_discord_invite_count(
  p_guild_id text,
  p_inviter_discord_user_id text,
  p_inviter_username text,
  p_invite_count integer
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_active_tracked_count integer;
  v_baseline_count integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_inviter_discord_user_id !~ '^[0-9]{17,20}$'
    or p_invite_count is null or p_invite_count < 0 or p_invite_count > 1000000
    or char_length(coalesce(p_inviter_username, '')) > 100 then
    raise exception 'Discord invite count data is invalid.';
  end if;

  select count(*)::integer into v_active_tracked_count
  from public.discord_member_lifecycle_snapshots as snapshot
  where snapshot.guild_id = p_guild_id
    and snapshot.inviter_discord_user_id = p_inviter_discord_user_id
    and snapshot.join_source = 'invite'
    and snapshot.left_at is null
    and not snapshot.invite_included_in_baseline;
  if p_invite_count < v_active_tracked_count then
    raise exception 'The requested total is below the % currently active tracked invites.', v_active_tracked_count;
  end if;

  v_baseline_count := p_invite_count - v_active_tracked_count;
  insert into public.discord_invite_leaderboard_baselines as baseline (
    guild_id, inviter_discord_user_id, inviter_username, invite_count, imported_at
  ) values (
    p_guild_id, p_inviter_discord_user_id, nullif(btrim(p_inviter_username), ''), v_baseline_count, now()
  ) on conflict (guild_id, inviter_discord_user_id) do update
    set inviter_username = coalesce(excluded.inviter_username, baseline.inviter_username),
        invite_count = excluded.invite_count,
        imported_at = now();

  return p_invite_count;
end;
$$;

revoke all on function public.record_disboard_bump_reminder_v2(text, text, timestamptz, timestamptz) from public;
revoke all on function public.attach_disboard_bump_confirmation(text, text, text) from public;
revoke all on function public.set_discord_invite_count(text, text, text, integer) from public;
grant execute on function public.record_disboard_bump_reminder_v2(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.attach_disboard_bump_confirmation(text, text, text) to service_role;
grant execute on function public.set_discord_invite_count(text, text, text, integer) to service_role;

notify pgrst, 'reload schema';
commit;
