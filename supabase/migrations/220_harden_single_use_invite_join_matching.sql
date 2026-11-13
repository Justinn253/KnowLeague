-- Attribute an otherwise-unknown join to a single-use invite only when that
-- invite became unavailable in a narrow window around the join. Discord's
-- Invite Delete event has no reason field, so active or merely recent invites
-- must never be guessed as the source.

begin;

drop function if exists public.claim_discord_single_use_invite(text, text);

create function public.claim_discord_single_use_invite(
  p_guild_id text,
  p_joining_discord_user_id text,
  p_joined_at timestamptz
)
returns table (
  status text,
  invite_code text,
  inviter_discord_user_id text,
  inviter_username text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_candidate_count integer;
  v_invite record;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_joining_discord_user_id !~ '^[0-9]{17,20}$'
    or p_joined_at is null then
    raise exception 'Discord guild, joining member, and join time are required.';
  end if;

  -- The invite must have existed at the join and must have become unavailable
  -- no more than twenty seconds after it. Five seconds of pre-join grace
  -- accommodates normal Gateway ordering and clock precision.
  select count(*)::integer into v_candidate_count
  from public.discord_single_use_invites as invite
  where invite.guild_id = p_guild_id
    and invite.consumed_at is null
    and invite.inviter_discord_user_id is not null
    and invite.created_at <= p_joined_at + interval '5 seconds'
    and (invite.expires_at is null or invite.expires_at >= p_joined_at - interval '5 seconds')
    and (
      (invite.deleted_at is not null
        and invite.deleted_at between p_joined_at - interval '5 seconds' and p_joined_at + interval '20 seconds')
      or (invite.expires_at is not null
        and invite.expires_at between p_joined_at - interval '5 seconds' and p_joined_at + interval '20 seconds'
        and invite.expires_at <= now())
    );

  if v_candidate_count = 0 then
    return query select 'none'::text, null::text, null::text, null::text;
    return;
  end if;
  if v_candidate_count > 1 then
    return query select 'ambiguous'::text, null::text, null::text, null::text;
    return;
  end if;

  select * into v_invite
  from public.discord_single_use_invites as invite
  where invite.guild_id = p_guild_id
    and invite.consumed_at is null
    and invite.inviter_discord_user_id is not null
    and invite.created_at <= p_joined_at + interval '5 seconds'
    and (invite.expires_at is null or invite.expires_at >= p_joined_at - interval '5 seconds')
    and (
      (invite.deleted_at is not null
        and invite.deleted_at between p_joined_at - interval '5 seconds' and p_joined_at + interval '20 seconds')
      or (invite.expires_at is not null
        and invite.expires_at between p_joined_at - interval '5 seconds' and p_joined_at + interval '20 seconds'
        and invite.expires_at <= now())
    )
  for update;
  if not found then
    return query select 'none'::text, null::text, null::text, null::text;
    return;
  end if;

  update public.discord_single_use_invites
  set consumed_by_discord_user_id = p_joining_discord_user_id,
      consumed_at = now(),
      updated_at = now()
  where guild_id = p_guild_id and invite_code = v_invite.invite_code;

  return query select 'matched'::text, v_invite.invite_code, v_invite.inviter_discord_user_id, v_invite.inviter_username;
end;
$$;

create or replace function public.consume_discord_single_use_invite(
  p_guild_id text,
  p_invite_code text,
  p_joining_discord_user_id text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_consumed boolean := false;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_joining_discord_user_id !~ '^[0-9]{17,20}$'
    or char_length(coalesce(p_invite_code, '')) not between 1 and 128 then
    raise exception 'Discord single-use invite consumption data is invalid.';
  end if;

  update public.discord_single_use_invites
  set consumed_by_discord_user_id = p_joining_discord_user_id,
      consumed_at = now(),
      updated_at = now()
  where guild_id = p_guild_id
    and invite_code = p_invite_code
    and consumed_at is null
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;

revoke all on function public.claim_discord_single_use_invite(text, text, timestamptz) from public;
revoke all on function public.consume_discord_single_use_invite(text, text, text) from public;
grant execute on function public.claim_discord_single_use_invite(text, text, timestamptz) to service_role;
grant execute on function public.consume_discord_single_use_invite(text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
