-- Discord does not always expose a one-use direct invite in the normal invite
-- usage comparison. Preserve invite-create metadata so an unknown join can be
-- attributed only when one eligible stored invite is unambiguous.

begin;

create table if not exists public.discord_single_use_invites (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  invite_code text not null check (char_length(invite_code) between 1 and 128),
  inviter_discord_user_id text check (inviter_discord_user_id is null or inviter_discord_user_id ~ '^[0-9]{17,20}$'),
  inviter_username text,
  created_at timestamptz not null,
  expires_at timestamptz,
  deleted_at timestamptz,
  consumed_by_discord_user_id text check (consumed_by_discord_user_id is null or consumed_by_discord_user_id ~ '^[0-9]{17,20}$'),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (guild_id, invite_code),
  check ((consumed_by_discord_user_id is null) = (consumed_at is null))
);

create index if not exists discord_single_use_invites_pending_idx
  on public.discord_single_use_invites (guild_id, created_at desc)
  where consumed_at is null;

alter table public.discord_single_use_invites enable row level security;
revoke all on table public.discord_single_use_invites from anon, authenticated;
grant select, insert, update, delete on table public.discord_single_use_invites to service_role;

create or replace function public.record_discord_single_use_invite(
  p_guild_id text,
  p_invite_code text,
  p_inviter_discord_user_id text,
  p_inviter_username text,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or char_length(coalesce(p_invite_code, '')) not between 1 and 128
    or p_created_at is null
    or (p_inviter_discord_user_id is not null and p_inviter_discord_user_id !~ '^[0-9]{17,20}$') then
    raise exception 'Discord single-use invite data is invalid.';
  end if;
  if p_expires_at is not null and p_expires_at < p_created_at then
    raise exception 'Discord single-use invite expiry precedes its creation.';
  end if;

  insert into public.discord_single_use_invites as invite (
    guild_id, invite_code, inviter_discord_user_id, inviter_username, created_at, expires_at, deleted_at,
    consumed_by_discord_user_id, consumed_at, updated_at
  ) values (
    p_guild_id, p_invite_code, p_inviter_discord_user_id, nullif(btrim(p_inviter_username), ''), p_created_at, p_expires_at, null,
    null, null, now()
  ) on conflict (guild_id, invite_code) do update
    set inviter_discord_user_id = coalesce(excluded.inviter_discord_user_id, invite.inviter_discord_user_id),
        inviter_username = coalesce(excluded.inviter_username, invite.inviter_username),
        created_at = least(invite.created_at, excluded.created_at),
        expires_at = coalesce(excluded.expires_at, invite.expires_at),
        deleted_at = null,
        updated_at = now();
end;
$$;

create or replace function public.mark_discord_single_use_invite_deleted(
  p_guild_id text,
  p_invite_code text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.discord_single_use_invites
  set deleted_at = now(), updated_at = now()
  where guild_id = p_guild_id
    and invite_code = p_invite_code
    and consumed_at is null;
end;
$$;

create or replace function public.claim_discord_single_use_invite(
  p_guild_id text,
  p_joining_discord_user_id text
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
  if p_guild_id !~ '^[0-9]{17,20}$' or p_joining_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and joining member identifiers must be valid snowflakes.';
  end if;

  select count(*)::integer into v_candidate_count
  from public.discord_single_use_invites as invite
  where invite.guild_id = p_guild_id
    and invite.consumed_at is null
    and invite.inviter_discord_user_id is not null
    and (invite.expires_at is null or invite.expires_at >= now() - interval '5 minutes')
    and (invite.deleted_at is null or invite.deleted_at >= now() - interval '5 minutes');

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
    and (invite.expires_at is null or invite.expires_at >= now() - interval '5 minutes')
    and (invite.deleted_at is null or invite.deleted_at >= now() - interval '5 minutes')
  for update;

  update public.discord_single_use_invites
  set consumed_by_discord_user_id = p_joining_discord_user_id,
      consumed_at = now(),
      updated_at = now()
  where guild_id = p_guild_id and invite_code = v_invite.invite_code;

  return query select 'matched'::text, v_invite.invite_code, v_invite.inviter_discord_user_id, v_invite.inviter_username;
end;
$$;

revoke all on function public.record_discord_single_use_invite(text, text, text, text, timestamptz, timestamptz) from public;
revoke all on function public.mark_discord_single_use_invite_deleted(text, text) from public;
revoke all on function public.claim_discord_single_use_invite(text, text) from public;
grant execute on function public.record_discord_single_use_invite(text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.mark_discord_single_use_invite_deleted(text, text) to service_role;
grant execute on function public.claim_discord_single_use_invite(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
