begin;

create table if not exists public.discord_leveling_settings (
  guild_id text primary key check (guild_id ~ '^[0-9]{17,20}$'),
  enabled boolean not null default true,
  xp_per_message integer not null default 15 check (xp_per_message between 1 and 1000),
  cooldown_seconds integer not null default 5 check (cooldown_seconds between 1 and 3600),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_guild_roles (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  role_id text not null check (role_id ~ '^[0-9]{17,20}$'),
  role_name text not null check (char_length(role_name) between 1 and 100),
  position integer not null,
  assignable boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (guild_id, role_id)
);

create index if not exists discord_guild_roles_guild_position_idx
  on public.discord_guild_roles(guild_id, position desc, role_name asc);

create table if not exists public.discord_leveling_role_rewards (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  level integer not null check (level between 2 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create index if not exists discord_leveling_role_rewards_guild_level_idx
  on public.discord_leveling_role_rewards(guild_id, level asc, discord_role_id asc);

create table if not exists public.discord_leveling_members (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  total_xp bigint not null default 0 check (total_xp >= 0),
  level integer not null default 1 check (level >= 1),
  last_xp_awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_user_id)
);

create index if not exists discord_leveling_members_guild_level_idx
  on public.discord_leveling_members(guild_id, level desc, total_xp desc);

alter table public.discord_leveling_settings enable row level security;
alter table public.discord_guild_roles enable row level security;
alter table public.discord_leveling_role_rewards enable row level security;
alter table public.discord_leveling_members enable row level security;

revoke all on table public.discord_leveling_settings from anon, authenticated;
revoke all on table public.discord_guild_roles from anon, authenticated;
revoke all on table public.discord_leveling_role_rewards from anon, authenticated;
revoke all on table public.discord_leveling_members from anon, authenticated;

grant select, insert, update, delete on table public.discord_leveling_settings to service_role;
grant select, insert, update, delete on table public.discord_guild_roles to service_role;
grant select, insert, update, delete on table public.discord_leveling_role_rewards to service_role;
grant select, insert, update, delete on table public.discord_leveling_members to service_role;

create or replace function public.discord_level_for_total_xp(p_total_xp bigint)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_level integer := 1;
  v_remaining_xp bigint := greatest(0, p_total_xp);
  v_required_xp bigint;
begin
  loop
    v_required_xp := 50::bigint * v_level * v_level - 100::bigint * v_level + 150;
    exit when v_remaining_xp < v_required_xp;
    v_remaining_xp := v_remaining_xp - v_required_xp;
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

create or replace function public.award_discord_chat_xp(
  p_guild_id text,
  p_discord_user_id text
)
returns table (
  awarded boolean,
  previous_level integer,
  current_level integer,
  total_xp bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.discord_leveling_settings%rowtype;
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
  v_current_level integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;

  select *
  into v_settings
  from public.discord_leveling_settings
  where guild_id = p_guild_id
  for share;

  if not found or not v_settings.enabled then
    return query select false, 1, 1, 0::bigint;
    return;
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select *
  into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id
  for update;

  if v_member.last_xp_awarded_at is not null
    and v_member.last_xp_awarded_at > now() - make_interval(secs => v_settings.cooldown_seconds) then
    return query select false, v_member.level, v_member.level, v_member.total_xp;
    return;
  end if;

  v_total_xp := v_member.total_xp + v_settings.xp_per_message;
  v_current_level := public.discord_level_for_total_xp(v_total_xp);

  update public.discord_leveling_members
  set total_xp = v_total_xp,
      level = v_current_level,
      last_xp_awarded_at = now(),
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;

  return query select true, v_member.level, v_current_level, v_total_xp;
end;
$$;

create or replace function public.replace_discord_leveling_settings(
  p_guild_id text,
  p_enabled boolean,
  p_xp_per_message integer,
  p_cooldown_seconds integer,
  p_updated_by uuid,
  p_role_rewards jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward jsonb;
  v_role_id text;
  v_level integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_xp_per_message not between 1 and 1000 then
    raise exception 'XP per message must be between 1 and 1000.';
  end if;
  if p_cooldown_seconds not between 1 and 3600 then
    raise exception 'Cooldown must be between 1 and 3600 seconds.';
  end if;
  if jsonb_typeof(p_role_rewards) <> 'array' or jsonb_array_length(p_role_rewards) > 50 then
    raise exception 'Provide between zero and fifty role rewards.';
  end if;

  for v_reward in select value from jsonb_array_elements(p_role_rewards)
  loop
    v_role_id := v_reward->>'roleId';
    v_level := (v_reward->>'level')::integer;
    if v_role_id !~ '^[0-9]{17,20}$' or v_level not between 2 and 10000 then
      raise exception 'Every role reward must include a valid role and level.';
    end if;
  end loop;

  if (
    select count(*)
    from (
      select value->>'roleId' as role_id
      from jsonb_array_elements(p_role_rewards)
    ) as submitted_rewards
  ) <> (
    select count(distinct value->>'roleId')
    from jsonb_array_elements(p_role_rewards)
  ) then
    raise exception 'Each Discord role can have only one level reward.';
  end if;

  insert into public.discord_leveling_settings (
    guild_id,
    enabled,
    xp_per_message,
    cooldown_seconds,
    updated_by,
    updated_at
  )
  values (
    p_guild_id,
    p_enabled,
    p_xp_per_message,
    p_cooldown_seconds,
    p_updated_by,
    now()
  )
  on conflict (guild_id) do update
  set enabled = excluded.enabled,
      xp_per_message = excluded.xp_per_message,
      cooldown_seconds = excluded.cooldown_seconds,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_leveling_role_rewards
  where guild_id = p_guild_id;

  insert into public.discord_leveling_role_rewards (guild_id, discord_role_id, level, updated_at)
  select
    p_guild_id,
    value->>'roleId',
    (value->>'level')::integer,
    now()
  from jsonb_array_elements(p_role_rewards);
end;
$$;

revoke all on function public.discord_level_for_total_xp(bigint) from public;
revoke all on function public.award_discord_chat_xp(text, text) from public;
revoke all on function public.replace_discord_leveling_settings(text, boolean, integer, integer, uuid, jsonb) from public;
grant execute on function public.award_discord_chat_xp(text, text) to service_role;
grant execute on function public.replace_discord_leveling_settings(text, boolean, integer, integer, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
