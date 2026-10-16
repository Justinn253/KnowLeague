begin;

create table if not exists public.discord_leveling_voice_sessions (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  joined_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

alter table public.discord_leveling_voice_sessions enable row level security;
revoke all on table public.discord_leveling_voice_sessions from anon, authenticated;
grant select, insert, update, delete on table public.discord_leveling_voice_sessions to service_role;

create or replace function public.start_discord_voice_xp_session(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  if not exists (select 1 from public.discord_leveling_settings where guild_id = p_guild_id) then
    raise exception 'Discord chat leveling is not initialized for this guild.';
  end if;
  if not (select enabled from public.discord_leveling_settings where guild_id = p_guild_id) then
    return;
  end if;

  insert into public.discord_leveling_voice_sessions (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;
end;
$$;

create or replace function public.reconcile_discord_voice_xp_sessions(
  p_guild_id text,
  p_connected_discord_user_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connected_discord_user_ids text[] := coalesce(p_connected_discord_user_ids, '{}'::text[]);
  v_discord_user_id text;
  v_enabled boolean;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;

  foreach v_discord_user_id in array v_connected_discord_user_ids
  loop
    if v_discord_user_id !~ '^[0-9]{17,20}$' then
      raise exception 'Every Discord user identifier must be valid.';
    end if;
  end loop;

  select enabled into v_enabled
  from public.discord_leveling_settings
  where guild_id = p_guild_id;
  if not found then
    raise exception 'Discord chat leveling is not initialized for this guild.';
  end if;
  if not v_enabled then
    delete from public.discord_leveling_voice_sessions where guild_id = p_guild_id;
    return;
  end if;

  delete from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and not (discord_user_id = any(v_connected_discord_user_ids));

  insert into public.discord_leveling_voice_sessions (guild_id, discord_user_id)
  select distinct p_guild_id, connected_user_id
  from unnest(v_connected_discord_user_ids) as connected_user_id
  on conflict (guild_id, discord_user_id) do nothing;
end;
$$;

create or replace function public.award_discord_voice_xp(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  awarded boolean,
  xp_awarded integer,
  previous_level integer,
  current_level integer,
  total_xp bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_joined_at timestamptz;
  v_minutes integer;
  v_settings public.discord_leveling_settings%rowtype;
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
  v_current_level integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select joined_at
  into v_joined_at
  from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  if not found then
    return query select false, 0, 0, 0, 0::bigint;
    return;
  end if;

  delete from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  v_minutes := floor(greatest(0, extract(epoch from now() - v_joined_at)) / 60)::integer;
  if v_minutes < 1 then
    return query select false, 0, 0, 0, 0::bigint;
    return;
  end if;

  select * into v_settings
  from public.discord_leveling_settings
  where guild_id = p_guild_id
  for share;
  if not found or not v_settings.enabled then
    return query select false, 0, 0, 0, 0::bigint;
    return;
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select * into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  v_total_xp := v_member.total_xp + v_minutes;
  v_current_level := public.discord_level_for_total_xp(v_total_xp);

  update public.discord_leveling_members
  set total_xp = v_total_xp,
      level = v_current_level,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  return query select true, v_minutes, v_member.level, v_current_level, v_total_xp;
end;
$$;

create or replace function public.reset_discord_chat_xp(
  p_guild_id text,
  p_discord_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  delete from public.discord_leveling_voice_sessions
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  update public.discord_leveling_members
  set total_xp = 0,
      level = 0,
      last_xp_awarded_at = null,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;
end;
$$;

revoke all on function public.start_discord_voice_xp_session(text, text) from public;
revoke all on function public.reconcile_discord_voice_xp_sessions(text, text[]) from public;
revoke all on function public.award_discord_voice_xp(text, text) from public;
revoke all on function public.reset_discord_chat_xp(text, text) from public;
grant execute on function public.start_discord_voice_xp_session(text, text) to service_role;
grant execute on function public.reconcile_discord_voice_xp_sessions(text, text[]) to service_role;
grant execute on function public.award_discord_voice_xp(text, text) to service_role;
grant execute on function public.reset_discord_chat_xp(text, text) to service_role;

notify pgrst, 'reload schema';

commit;
