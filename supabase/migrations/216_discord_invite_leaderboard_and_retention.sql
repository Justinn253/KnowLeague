-- Preserve an existing invite tracker total while tracking retention for the
-- members KnowLeague can attribute. Imported totals are reconciled, not added,
-- so an administrator can safely re-import a newer Invite Tracker export.

begin;

alter table public.discord_member_lifecycle_snapshots
  add column if not exists invite_included_in_baseline boolean not null default false;

create table if not exists public.discord_invite_leaderboard_baselines (
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  inviter_discord_user_id text not null check (inviter_discord_user_id ~ '^[0-9]{17,20}$'),
  inviter_username text,
  invite_count integer not null default 0 check (invite_count >= 0 and invite_count <= 1000000),
  imported_at timestamptz not null default now(),
  primary key (guild_id, inviter_discord_user_id)
);

alter table public.discord_invite_leaderboard_baselines enable row level security;
revoke all on table public.discord_invite_leaderboard_baselines from anon, authenticated;
grant select, insert, update, delete on table public.discord_invite_leaderboard_baselines to service_role;

create or replace function public.get_discord_invite_total(
  p_guild_id text,
  p_inviter_discord_user_id text
)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select baseline.invite_count
    from public.discord_invite_leaderboard_baselines as baseline
    where baseline.guild_id = p_guild_id
      and baseline.inviter_discord_user_id = p_inviter_discord_user_id
  ), 0) + (
    select count(*)::integer
    from public.discord_member_lifecycle_snapshots as snapshot
    where snapshot.guild_id = p_guild_id
      and snapshot.inviter_discord_user_id = p_inviter_discord_user_id
      and snapshot.join_source = 'invite'
      and snapshot.left_at is null
      and not snapshot.invite_included_in_baseline
  );
$$;

create or replace function public.get_discord_invite_leaderboard(
  p_guild_id text,
  p_limit integer default 10,
  p_discord_user_id text default null
)
returns table (
  discord_user_id text,
  inviter_username text,
  invite_count integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be a valid snowflake.';
  end if;
  if p_discord_user_id is not null and p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord user identifier must be a valid snowflake.';
  end if;
  if p_limit < 1 or p_limit > 25 then
    raise exception 'Invite leaderboard limits must be between one and twenty-five.';
  end if;

  return query
  with inviters as (
    select baseline.inviter_discord_user_id as user_id
    from public.discord_invite_leaderboard_baselines as baseline
    where baseline.guild_id = p_guild_id
    union
    select snapshot.inviter_discord_user_id
    from public.discord_member_lifecycle_snapshots as snapshot
    where snapshot.guild_id = p_guild_id
      and snapshot.join_source = 'invite'
      and snapshot.inviter_discord_user_id is not null
  ), ranked as (
    select
      inviter.user_id,
      coalesce(
        (
          select snapshot.inviter_username
          from public.discord_member_lifecycle_snapshots as snapshot
          where snapshot.guild_id = p_guild_id
            and snapshot.inviter_discord_user_id = inviter.user_id
            and snapshot.inviter_username is not null
          order by snapshot.updated_at desc
          limit 1
        ),
        (
          select baseline.inviter_username
          from public.discord_invite_leaderboard_baselines as baseline
          where baseline.guild_id = p_guild_id
            and baseline.inviter_discord_user_id = inviter.user_id
        )
      ) as resolved_username,
      public.get_discord_invite_total(p_guild_id, inviter.user_id) as total
    from inviters as inviter
    where p_discord_user_id is null or inviter.user_id = p_discord_user_id
  )
  select ranked.user_id, ranked.resolved_username, ranked.total
  from ranked
  where p_discord_user_id is not null or ranked.total > 0
  order by ranked.total desc, ranked.user_id
  limit case when p_discord_user_id is null then p_limit else 1 end;
end;
$$;

create or replace function public.import_discord_invite_leaderboard(
  p_guild_id text,
  p_entries jsonb
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_entry record;
  v_live_count integer;
  v_imported integer := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) > 10000 then
    raise exception 'Provide a valid Discord guild and at most ten thousand invite entries.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as entry(discord_user_id text, inviter_username text, invite_count integer)
    group by entry.discord_user_id
    having count(*) > 1
  ) then
    raise exception 'Each inviter can appear only once in an invite leaderboard import.';
  end if;

  for v_entry in
    select *
    from jsonb_to_recordset(p_entries) as entry(discord_user_id text, inviter_username text, invite_count integer)
  loop
    if coalesce(v_entry.discord_user_id, '') !~ '^[0-9]{17,20}$'
      or v_entry.invite_count is null
      or v_entry.invite_count < 0
      or v_entry.invite_count > 1000000
      or char_length(coalesce(v_entry.inviter_username, '')) > 100 then
      raise exception 'Each imported invite leaderboard entry must be valid.';
    end if;

    select count(*)::integer into v_live_count
    from public.discord_member_lifecycle_snapshots as snapshot
    where snapshot.guild_id = p_guild_id
      and snapshot.inviter_discord_user_id = v_entry.discord_user_id
      and snapshot.join_source = 'invite'
      and snapshot.left_at is null
      and not snapshot.invite_included_in_baseline;

    if v_entry.invite_count < v_live_count then
      raise exception 'Imported total for inviter % is smaller than this bot''s % active tracked invitees.', v_entry.discord_user_id, v_live_count;
    end if;

    insert into public.discord_invite_leaderboard_baselines as baseline (
      guild_id, inviter_discord_user_id, inviter_username, invite_count, imported_at
    ) values (
      p_guild_id, v_entry.discord_user_id, nullif(btrim(v_entry.inviter_username), ''), v_entry.invite_count - v_live_count, now()
    ) on conflict (guild_id, inviter_discord_user_id) do update
      set inviter_username = coalesce(excluded.inviter_username, baseline.inviter_username),
          invite_count = excluded.invite_count,
          imported_at = now();
    v_imported := v_imported + 1;
  end loop;

  return v_imported;
end;
$$;

create or replace function public.import_discord_invited_members(
  p_guild_id text,
  p_inviter_discord_user_id text,
  p_inviter_username text,
  p_members jsonb
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_member record;
  v_previous_inviter_id text;
  v_previously_included boolean;
  v_was_active boolean;
  v_imported integer := 0;
begin
  if p_guild_id !~ '^[0-9]{17,20}$'
    or p_inviter_discord_user_id !~ '^[0-9]{17,20}$'
    or jsonb_typeof(p_members) <> 'array'
    or jsonb_array_length(p_members) > 10000 then
    raise exception 'Provide valid Discord identifiers and at most ten thousand invited members.';
  end if;
  if not exists (
    select 1
    from public.discord_invite_leaderboard_baselines as baseline
    where baseline.guild_id = p_guild_id
      and baseline.inviter_discord_user_id = p_inviter_discord_user_id
  ) then
    raise exception 'Import the Invite Tracker leaderboard before importing historical invited members.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_members) as member(discord_user_id text, member_username text, member_display_name text, joined_at timestamptz, role_snapshot jsonb)
    group by member.discord_user_id
    having count(*) > 1
  ) then
    raise exception 'Each invited member can appear only once in an import.';
  end if;

  for v_member in
    select *
    from jsonb_to_recordset(p_members) as member(
      discord_user_id text, member_username text, member_display_name text,
      joined_at timestamptz, role_snapshot jsonb
    )
  loop
    if coalesce(v_member.discord_user_id, '') !~ '^[0-9]{17,20}$'
      or coalesce(v_member.member_username, '') = ''
      or coalesce(v_member.member_display_name, '') = ''
      or v_member.joined_at is null
      or jsonb_typeof(v_member.role_snapshot) <> 'array' then
      raise exception 'Each imported invited member must be valid.';
    end if;

    select snapshot.inviter_discord_user_id, snapshot.invite_included_in_baseline, snapshot.left_at is null
      into v_previous_inviter_id, v_previously_included, v_was_active
    from public.discord_member_lifecycle_snapshots as snapshot
    where snapshot.guild_id = p_guild_id and snapshot.discord_user_id = v_member.discord_user_id
    for update;

    -- A live post-cutover member was previously included as an additive count.
    -- Moving it into the imported baseline must keep its old inviter's total unchanged.
    if found and v_was_active and not v_previously_included and v_previous_inviter_id is not null then
      update public.discord_invite_leaderboard_baselines as baseline
      set invite_count = baseline.invite_count + 1,
          imported_at = now()
      where baseline.guild_id = p_guild_id
        and baseline.inviter_discord_user_id = v_previous_inviter_id;
    end if;

    insert into public.discord_member_join_events (
      guild_id, discord_user_id, joined_at, join_source, invite_code, inviter_discord_user_id, inviter_username
    ) values (
      p_guild_id, v_member.discord_user_id, v_member.joined_at, 'invite', null,
      p_inviter_discord_user_id, nullif(btrim(p_inviter_username), '')
    ) on conflict (guild_id, discord_user_id, joined_at) do nothing;

    insert into public.discord_member_lifecycle_snapshots as snapshot (
      guild_id, discord_user_id, member_username, member_display_name, joined_at,
      join_source, invite_code, inviter_discord_user_id, inviter_username, role_snapshot,
      chat_xp_level, last_message_id, last_message_channel_id, last_message_at,
      invite_included_in_baseline, left_at, updated_at
    ) values (
      p_guild_id, v_member.discord_user_id, v_member.member_username, v_member.member_display_name, v_member.joined_at,
      'invite', null, p_inviter_discord_user_id, nullif(btrim(p_inviter_username), ''), v_member.role_snapshot,
      0, null, null, null, true, null, now()
    ) on conflict (guild_id, discord_user_id) do update
      set member_username = excluded.member_username,
          member_display_name = excluded.member_display_name,
          joined_at = excluded.joined_at,
          join_source = excluded.join_source,
          invite_code = null,
          inviter_discord_user_id = excluded.inviter_discord_user_id,
          inviter_username = excluded.inviter_username,
          role_snapshot = excluded.role_snapshot,
          invite_included_in_baseline = true,
          left_at = null,
          updated_at = now();
    v_imported := v_imported + 1;
  end loop;

  return v_imported;
end;
$$;

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
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and member identifiers must be valid snowflakes.';
  end if;
  if p_member_username = '' or p_member_display_name = '' or p_joined_at is null then
    raise exception 'Discord member names and join time are required.';
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
    chat_xp_level, last_message_id, last_message_channel_id, last_message_at,
    invite_included_in_baseline, left_at, updated_at
  ) values (
    p_guild_id, p_discord_user_id, p_member_username, p_member_display_name, p_joined_at,
    p_join_source, p_invite_code, p_inviter_discord_user_id, p_inviter_username, p_role_snapshot,
    0, null, null, null, false, null, now()
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
        invite_included_in_baseline = false,
        left_at = null,
        updated_at = now();

  if p_inviter_discord_user_id is null then
    return query select 0;
  else
    return query select public.get_discord_invite_total(p_guild_id, p_inviter_discord_user_id);
  end if;
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
declare
  v_inviter_discord_user_id text;
  v_invite_included_in_baseline boolean := false;
  v_was_active boolean := false;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and member identifiers must be valid snowflakes.';
  end if;
  if p_member_username = '' or p_member_display_name = '' or jsonb_typeof(p_role_snapshot) <> 'array' then
    raise exception 'Each Discord member snapshot must be valid.';
  end if;

  select snapshot.inviter_discord_user_id, snapshot.invite_included_in_baseline, snapshot.left_at is null
    into v_inviter_discord_user_id, v_invite_included_in_baseline, v_was_active
  from public.discord_member_lifecycle_snapshots as snapshot
  where snapshot.guild_id = p_guild_id and snapshot.discord_user_id = p_discord_user_id
  for update;

  if found and v_was_active and v_invite_included_in_baseline and v_inviter_discord_user_id is not null then
    update public.discord_invite_leaderboard_baselines as baseline
    set invite_count = greatest(baseline.invite_count - 1, 0),
        imported_at = now()
    where baseline.guild_id = p_guild_id
      and baseline.inviter_discord_user_id = v_inviter_discord_user_id;
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

revoke all on function public.get_discord_invite_total(text, text) from public;
revoke all on function public.get_discord_invite_leaderboard(text, integer, text) from public;
revoke all on function public.import_discord_invite_leaderboard(text, jsonb) from public;
revoke all on function public.import_discord_invited_members(text, text, text, jsonb) from public;
revoke all on function public.record_discord_member_join(text, text, text, text, timestamptz, text, text, text, text, jsonb) from public;
revoke all on function public.record_discord_member_leave(text, text, text, text, timestamptz, jsonb, integer) from public;
grant execute on function public.get_discord_invite_total(text, text) to service_role;
grant execute on function public.get_discord_invite_leaderboard(text, integer, text) to service_role;
grant execute on function public.import_discord_invite_leaderboard(text, jsonb) to service_role;
grant execute on function public.import_discord_invited_members(text, text, text, jsonb) to service_role;
grant execute on function public.record_discord_member_join(text, text, text, text, timestamptz, text, text, text, text, jsonb) to service_role;
grant execute on function public.record_discord_member_leave(text, text, text, text, timestamptz, jsonb, integer) to service_role;

notify pgrst, 'reload schema';
commit;
