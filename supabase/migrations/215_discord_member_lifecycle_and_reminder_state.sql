begin;

alter table public.discord_leveling_settings
  add column if not exists invite_join_message_channel_id text
    check (invite_join_message_channel_id is null or invite_join_message_channel_id ~ '^[0-9]{17,20}$'),
  add column if not exists invite_join_message_template text not null default '**{user}** has been invited by {inviter}! They now have {inviteCount} invites.'
    check (char_length(invite_join_message_template) between 1 and 500),
  add column if not exists welcome_join_message_channel_id text
    check (welcome_join_message_channel_id is null or welcome_join_message_channel_id ~ '^[0-9]{17,20}$'),
  add column if not exists welcome_join_message_template text not null default '**{user}** joined the server! Check out <#1541690751132500008> and <#1539079954153865246> for server information. Also, please assign your extra roles in <#1558207698548293754>!'
    check (char_length(welcome_join_message_template) between 1 and 500),
  add column if not exists leave_message_channel_id text
    check (leave_message_channel_id is null or leave_message_channel_id ~ '^[0-9]{17,20}$'),
  add column if not exists disboard_bump_reminder_due_at timestamptz,
  add column if not exists disboard_bump_reminder_source_message_id text
    check (disboard_bump_reminder_source_message_id is null or disboard_bump_reminder_source_message_id ~ '^[0-9]{17,20}$');

alter table public.discord_leveling_settings
  drop constraint if exists discord_leveling_settings_disboard_bump_reminder_state_check;

alter table public.discord_leveling_settings
  add constraint discord_leveling_settings_disboard_bump_reminder_state_check
  check ((disboard_bump_reminder_due_at is null) = (disboard_bump_reminder_source_message_id is null));

create table if not exists public.discord_member_join_events (
  id bigint generated always as identity primary key,
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  joined_at timestamptz not null,
  join_source text not null check (join_source in ('invite', 'vanity', 'unknown')),
  invite_code text,
  inviter_discord_user_id text check (inviter_discord_user_id is null or inviter_discord_user_id ~ '^[0-9]{17,20}$'),
  inviter_username text,
  created_at timestamptz not null default now(),
  unique (guild_id, discord_user_id, joined_at)
);

create index if not exists discord_member_join_events_inviter_idx
  on public.discord_member_join_events (guild_id, inviter_discord_user_id, joined_at desc)
  where inviter_discord_user_id is not null;

create table if not exists public.discord_member_lifecycle_snapshots (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  member_username text not null,
  member_display_name text not null,
  joined_at timestamptz not null,
  join_source text not null default 'unknown' check (join_source in ('invite', 'vanity', 'unknown')),
  invite_code text,
  inviter_discord_user_id text check (inviter_discord_user_id is null or inviter_discord_user_id ~ '^[0-9]{17,20}$'),
  inviter_username text,
  role_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(role_snapshot) = 'array'),
  chat_xp_level integer not null default 0 check (chat_xp_level >= 0),
  last_message_id text check (last_message_id is null or last_message_id ~ '^[0-9]{17,20}$'),
  last_message_channel_id text check (last_message_channel_id is null or last_message_channel_id ~ '^[0-9]{17,20}$'),
  last_message_at timestamptz,
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id),
  check ((last_message_id is null) = (last_message_channel_id is null))
);

alter table public.discord_member_join_events enable row level security;
alter table public.discord_member_lifecycle_snapshots enable row level security;

revoke all on table public.discord_member_join_events from anon, authenticated;
revoke all on table public.discord_member_lifecycle_snapshots from anon, authenticated;

grant select, insert, update, delete on table public.discord_member_join_events to service_role;
grant select, insert, update, delete on table public.discord_member_lifecycle_snapshots to service_role;

create or replace function public.record_discord_member_join(
  p_guild_id text,
  p_discord_user_id text,
  p_member_username text,
  p_member_display_name text,
  p_joined_at timestamptz,
  p_join_source text,
  p_invite_code text,
  p_inviter_discord_user_id text,
  p_inviter_username text,
  p_role_snapshot jsonb
)
returns table (invite_count integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_invite_count integer := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and member identifiers must be valid snowflakes.';
  end if;
  if p_member_username = '' or p_member_display_name = '' then
    raise exception 'Discord member names are required.';
  end if;
  if p_join_source not in ('invite', 'vanity', 'unknown') then
    raise exception 'Unsupported Discord join source.';
  end if;
  if jsonb_typeof(p_role_snapshot) <> 'array' then
    raise exception 'Discord role snapshots must be JSON arrays.';
  end if;

  insert into public.discord_member_join_events (
    guild_id, discord_user_id, joined_at, join_source, invite_code, inviter_discord_user_id, inviter_username
  ) values (
    p_guild_id, p_discord_user_id, p_joined_at, p_join_source, p_invite_code, p_inviter_discord_user_id, p_inviter_username
  ) on conflict (guild_id, discord_user_id, joined_at) do nothing;

  insert into public.discord_member_lifecycle_snapshots as snapshot (
    guild_id, discord_user_id, member_username, member_display_name, joined_at,
    join_source, invite_code, inviter_discord_user_id, inviter_username, role_snapshot,
    chat_xp_level, last_message_id, last_message_channel_id, last_message_at, left_at, updated_at
  ) values (
    p_guild_id, p_discord_user_id, p_member_username, p_member_display_name, p_joined_at,
    p_join_source, p_invite_code, p_inviter_discord_user_id, p_inviter_username, p_role_snapshot,
    0, null, null, null, null, now()
  ) on conflict (guild_id, discord_user_id) do update
    set member_username = excluded.member_username,
        member_display_name = excluded.member_display_name,
        joined_at = excluded.joined_at,
        join_source = excluded.join_source,
        invite_code = excluded.invite_code,
        inviter_discord_user_id = excluded.inviter_discord_user_id,
        inviter_username = excluded.inviter_username,
        role_snapshot = excluded.role_snapshot,
        chat_xp_level = 0,
        last_message_id = null,
        last_message_channel_id = null,
        last_message_at = null,
        left_at = null,
        updated_at = now();

  if p_inviter_discord_user_id is not null then
    select count(*)::integer into v_invite_count
    from public.discord_member_join_events
    where guild_id = p_guild_id and inviter_discord_user_id = p_inviter_discord_user_id;
  end if;

  return query select v_invite_count;
end;
$$;

create or replace function public.record_discord_member_leave(
  p_guild_id text,
  p_discord_user_id text,
  p_member_username text,
  p_member_display_name text,
  p_joined_at timestamptz,
  p_role_snapshot jsonb,
  p_chat_xp_level integer
)
returns table (
  joined_at timestamptz, join_source text, invite_code text,
  inviter_discord_user_id text, inviter_username text, role_snapshot jsonb,
  chat_xp_level integer, last_message_id text, last_message_channel_id text, last_message_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and member identifiers must be valid snowflakes.';
  end if;
  if p_member_username = '' or p_member_display_name = '' or jsonb_typeof(p_role_snapshot) <> 'array' then
    raise exception 'Each Discord member snapshot must be valid.';
  end if;

  insert into public.discord_member_lifecycle_snapshots as snapshot (
    guild_id, discord_user_id, member_username, member_display_name, joined_at, role_snapshot, chat_xp_level, left_at, updated_at
  ) values (
    p_guild_id, p_discord_user_id, p_member_username, p_member_display_name, p_joined_at, p_role_snapshot, greatest(p_chat_xp_level, 0), now(), now()
  ) on conflict (guild_id, discord_user_id) do update
    set member_username = excluded.member_username,
        member_display_name = excluded.member_display_name,
        role_snapshot = excluded.role_snapshot,
        chat_xp_level = excluded.chat_xp_level,
        left_at = now(),
        updated_at = now();

  return query
  select snapshot.joined_at, snapshot.join_source, snapshot.invite_code,
    snapshot.inviter_discord_user_id, snapshot.inviter_username, snapshot.role_snapshot,
    snapshot.chat_xp_level, snapshot.last_message_id, snapshot.last_message_channel_id, snapshot.last_message_at
  from public.discord_member_lifecycle_snapshots as snapshot
  where snapshot.guild_id = p_guild_id and snapshot.discord_user_id = p_discord_user_id;
end;
$$;

create or replace function public.track_discord_member_last_message(
  p_guild_id text,
  p_discord_user_id text,
  p_member_username text,
  p_member_display_name text,
  p_joined_at timestamptz,
  p_message_id text,
  p_channel_id text,
  p_message_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_message_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord identifiers must be valid snowflakes.';
  end if;

  insert into public.discord_member_lifecycle_snapshots as snapshot (
    guild_id, discord_user_id, member_username, member_display_name, joined_at,
    last_message_id, last_message_channel_id, last_message_at, updated_at
  ) values (
    p_guild_id, p_discord_user_id, p_member_username, p_member_display_name, p_joined_at,
    p_message_id, p_channel_id, p_message_at, now()
  ) on conflict (guild_id, discord_user_id) do update
    set member_username = excluded.member_username,
        member_display_name = excluded.member_display_name,
        last_message_id = excluded.last_message_id,
        last_message_channel_id = excluded.last_message_channel_id,
        last_message_at = excluded.last_message_at,
        updated_at = now()
    where snapshot.last_message_at is null or snapshot.last_message_at <= excluded.last_message_at;
end;
$$;

create or replace function public.backfill_discord_member_lifecycle_snapshots(
  p_guild_id text,
  p_members jsonb
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer := 0;
  v_member record;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or jsonb_typeof(p_members) <> 'array' then
    raise exception 'A valid Discord guild and member array are required.';
  end if;
  for v_member in
    select * from jsonb_to_recordset(p_members) as member(
      discord_user_id text, member_username text, member_display_name text,
      joined_at timestamptz, role_snapshot jsonb, chat_xp_level integer
    )
  loop
    if v_member.discord_user_id !~ '^[0-9]{17,20}$'
      or coalesce(v_member.member_username, '') = ''
      or coalesce(v_member.member_display_name, '') = ''
      or v_member.joined_at is null
      or jsonb_typeof(v_member.role_snapshot) <> 'array' then
      raise exception 'Each Discord member snapshot must be valid.';
    end if;
    insert into public.discord_member_lifecycle_snapshots as snapshot (
      guild_id, discord_user_id, member_username, member_display_name, joined_at, role_snapshot, chat_xp_level, left_at, updated_at
    ) values (
      p_guild_id, v_member.discord_user_id, v_member.member_username, v_member.member_display_name,
      v_member.joined_at, v_member.role_snapshot, greatest(coalesce(v_member.chat_xp_level, 0), 0), null, now()
    ) on conflict (guild_id, discord_user_id) do update
      set member_username = excluded.member_username,
          member_display_name = excluded.member_display_name,
          joined_at = excluded.joined_at,
          role_snapshot = excluded.role_snapshot,
          chat_xp_level = excluded.chat_xp_level,
          left_at = null,
          updated_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.claim_disboard_bump_reminder(
  p_guild_id text,
  p_source_message_id text,
  p_due_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  update public.discord_leveling_settings
  set disboard_bump_reminder_due_at = null,
      disboard_bump_reminder_source_message_id = null
  where guild_id = p_guild_id
    and disboard_bump_reminder_source_message_id = p_source_message_id
    and disboard_bump_reminder_due_at = p_due_at
    and disboard_bump_reminder_due_at <= now()
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.record_discord_member_join(text, text, text, text, timestamptz, text, text, text, text, jsonb) from public;
revoke all on function public.record_discord_member_leave(text, text, text, text, timestamptz, jsonb, integer) from public;
revoke all on function public.track_discord_member_last_message(text, text, text, text, timestamptz, text, text, timestamptz) from public;
revoke all on function public.backfill_discord_member_lifecycle_snapshots(text, jsonb) from public;
revoke all on function public.claim_disboard_bump_reminder(text, text, timestamptz) from public;
grant execute on function public.record_discord_member_join(text, text, text, text, timestamptz, text, text, text, text, jsonb) to service_role;
grant execute on function public.record_discord_member_leave(text, text, text, text, timestamptz, jsonb, integer) to service_role;
grant execute on function public.track_discord_member_last_message(text, text, text, text, timestamptz, text, text, timestamptz) to service_role;
grant execute on function public.backfill_discord_member_lifecycle_snapshots(text, jsonb) to service_role;
grant execute on function public.claim_disboard_bump_reminder(text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
