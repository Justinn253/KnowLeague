begin;

alter table public.discord_leveling_settings
  add column if not exists level_up_message_channel_id text,
  add column if not exists leaderboard_top_role_id text;

alter table public.discord_leveling_settings
  drop constraint if exists discord_leveling_settings_level_up_message_channel_id_check,
  drop constraint if exists discord_leveling_settings_leaderboard_top_role_id_check;

alter table public.discord_leveling_settings
  add constraint discord_leveling_settings_level_up_message_channel_id_check
    check (level_up_message_channel_id is null or level_up_message_channel_id ~ '^[0-9]{17,20}$'),
  add constraint discord_leveling_settings_leaderboard_top_role_id_check
    check (leaderboard_top_role_id is null or leaderboard_top_role_id ~ '^[0-9]{17,20}$');

create table if not exists public.discord_leveling_leaderboard_excluded_roles (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create table if not exists public.discord_leveling_leaderboard_role_assignments (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now()
);

create index if not exists discord_leveling_members_guild_total_xp_idx
  on public.discord_leveling_members(guild_id, total_xp desc, discord_user_id asc);

alter table public.discord_leveling_leaderboard_excluded_roles enable row level security;
alter table public.discord_leveling_leaderboard_role_assignments enable row level security;
revoke all on table public.discord_leveling_leaderboard_excluded_roles from anon, authenticated;
revoke all on table public.discord_leveling_leaderboard_role_assignments from anon, authenticated;
grant select, insert, update, delete on table public.discord_leveling_leaderboard_excluded_roles to service_role;
grant select, insert, update, delete on table public.discord_leveling_leaderboard_role_assignments to service_role;

drop function if exists public.replace_discord_leveling_settings(text, boolean, integer, integer, boolean, text, uuid, jsonb, jsonb);

create or replace function public.replace_discord_leveling_settings(
  p_guild_id text,
  p_enabled boolean,
  p_xp_per_message integer,
  p_cooldown_seconds integer,
  p_level_up_message_enabled boolean,
  p_level_up_message_template text,
  p_level_up_message_channel_id text,
  p_leaderboard_top_role_id text,
  p_updated_by uuid,
  p_role_rewards jsonb,
  p_manual_xp_role_ids jsonb,
  p_leaderboard_excluded_role_ids jsonb
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
  v_role_ids jsonb;
  v_reward_message text;
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
  if char_length(btrim(p_level_up_message_template)) not between 1 and 500 then
    raise exception 'Level-up message templates must contain between 1 and 500 characters.';
  end if;
  if p_level_up_message_channel_id is not null and p_level_up_message_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Level-up channel ID must be a valid Discord snowflake.';
  end if;
  if p_leaderboard_top_role_id is not null and p_leaderboard_top_role_id !~ '^[0-9]{17,20}$' then
    raise exception 'Leaderboard top role must be a valid Discord snowflake.';
  end if;
  if jsonb_typeof(p_role_rewards) <> 'array' or jsonb_array_length(p_role_rewards) > 50 then
    raise exception 'Provide between zero and fifty reward levels.';
  end if;
  if jsonb_typeof(p_manual_xp_role_ids) <> 'array' or jsonb_array_length(p_manual_xp_role_ids) > 25 then
    raise exception 'Provide between zero and twenty-five manual XP staff roles.';
  end if;
  if jsonb_typeof(p_leaderboard_excluded_role_ids) <> 'array' or jsonb_array_length(p_leaderboard_excluded_role_ids) > 25 then
    raise exception 'Provide between zero and twenty-five leaderboard exclusion roles.';
  end if;

  for v_reward in select value from jsonb_array_elements(p_role_rewards)
  loop
    v_level := (v_reward->>'level')::integer;
    v_role_ids := v_reward->'roleIds';
    v_reward_message := nullif(btrim(v_reward->>'levelUpMessageTemplate'), '');
    if v_level not between 1 and 10000 then
      raise exception 'Every reward level must be between 1 and 10000.';
    end if;
    if jsonb_typeof(v_role_ids) <> 'array' or jsonb_array_length(v_role_ids) = 0 then
      raise exception 'Every reward level must include one or more Discord roles.';
    end if;
    if v_reward_message is not null and char_length(v_reward_message) > 500 then
      raise exception 'Reward-level messages must not exceed 500 characters.';
    end if;
    for v_role_id in select value #>> '{}' from jsonb_array_elements(v_role_ids)
    loop
      if v_role_id !~ '^[0-9]{17,20}$' then
        raise exception 'Every reward role must be a valid Discord role.';
      end if;
    end loop;
  end loop;

  if (
    select count(*) from jsonb_array_elements(p_role_rewards)
  ) <> (
    select count(distinct (value->>'level')::integer) from jsonb_array_elements(p_role_rewards)
  ) then
    raise exception 'Each reward level can only be configured once.';
  end if;

  if (
    select coalesce(sum(jsonb_array_length(value->'roleIds')), 0) from jsonb_array_elements(p_role_rewards)
  ) > 50 then
    raise exception 'Provide up to fifty total reward roles.';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_role_rewards) as reward, jsonb_array_elements(reward.value->'roleIds')
  ) <> (
    select count(distinct role.value #>> '{}')
    from jsonb_array_elements(p_role_rewards) as reward, jsonb_array_elements(reward.value->'roleIds') as role
  ) then
    raise exception 'Each Discord reward role can only be selected once.';
  end if;

  for v_role_id in select value #>> '{}' from jsonb_array_elements(p_manual_xp_role_ids)
  loop
    if v_role_id !~ '^[0-9]{17,20}$' then
      raise exception 'Every manual XP staff role must be a valid Discord role.';
    end if;
  end loop;

  if (
    select count(*) from jsonb_array_elements(p_manual_xp_role_ids)
  ) <> (
    select count(distinct value #>> '{}') from jsonb_array_elements(p_manual_xp_role_ids)
  ) then
    raise exception 'Each manual XP staff role can only be selected once.';
  end if;

  for v_role_id in select value #>> '{}' from jsonb_array_elements(p_leaderboard_excluded_role_ids)
  loop
    if v_role_id !~ '^[0-9]{17,20}$' then
      raise exception 'Every leaderboard exclusion role must be a valid Discord role.';
    end if;
  end loop;

  if (
    select count(*) from jsonb_array_elements(p_leaderboard_excluded_role_ids)
  ) <> (
    select count(distinct value #>> '{}') from jsonb_array_elements(p_leaderboard_excluded_role_ids)
  ) then
    raise exception 'Each leaderboard exclusion role can only be selected once.';
  end if;

  if p_leaderboard_top_role_id is not null and exists (
    select 1
    from jsonb_array_elements(p_role_rewards) as reward,
      jsonb_array_elements_text(reward.value->'roleIds') as role_id
    where role_id = p_leaderboard_top_role_id
  ) then
    raise exception 'The leaderboard top role cannot also be a level reward.';
  end if;

  if p_leaderboard_top_role_id is not null and p_leaderboard_top_role_id in (
    select value #>> '{}' from jsonb_array_elements(p_manual_xp_role_ids)
  ) then
    raise exception 'The leaderboard top role cannot also be a manual XP staff role.';
  end if;

  if p_leaderboard_top_role_id is not null and p_leaderboard_top_role_id in (
    select value #>> '{}' from jsonb_array_elements(p_leaderboard_excluded_role_ids)
  ) then
    raise exception 'The leaderboard top role cannot exclude its own holders.';
  end if;

  insert into public.discord_leveling_settings (
    guild_id, enabled, xp_per_message, cooldown_seconds, level_up_message_enabled,
    level_up_message_template, level_up_message_channel_id, leaderboard_top_role_id, updated_by, updated_at
  ) values (
    p_guild_id, p_enabled, p_xp_per_message, p_cooldown_seconds, p_level_up_message_enabled,
    btrim(p_level_up_message_template), p_level_up_message_channel_id, p_leaderboard_top_role_id, p_updated_by, now()
  ) on conflict (guild_id) do update
  set enabled = excluded.enabled,
      xp_per_message = excluded.xp_per_message,
      cooldown_seconds = excluded.cooldown_seconds,
      level_up_message_enabled = excluded.level_up_message_enabled,
      level_up_message_template = excluded.level_up_message_template,
      level_up_message_channel_id = excluded.level_up_message_channel_id,
      leaderboard_top_role_id = excluded.leaderboard_top_role_id,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_leveling_role_rewards where guild_id = p_guild_id;
  delete from public.discord_leveling_reward_level_messages where guild_id = p_guild_id;

  for v_reward in select value from jsonb_array_elements(p_role_rewards)
  loop
    v_level := (v_reward->>'level')::integer;
    v_role_ids := v_reward->'roleIds';
    v_reward_message := nullif(btrim(v_reward->>'levelUpMessageTemplate'), '');
    if v_reward_message is not null then
      insert into public.discord_leveling_reward_level_messages (guild_id, level, message_template, updated_at)
      values (p_guild_id, v_level, v_reward_message, now());
    end if;
    for v_role_id in select value #>> '{}' from jsonb_array_elements(v_role_ids)
    loop
      insert into public.discord_leveling_role_rewards (guild_id, discord_role_id, level, updated_at)
      values (p_guild_id, v_role_id, v_level, now());
    end loop;
  end loop;

  delete from public.discord_leveling_staff_roles where guild_id = p_guild_id;
  insert into public.discord_leveling_staff_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, value #>> '{}', now()
  from jsonb_array_elements(p_manual_xp_role_ids);

  delete from public.discord_leveling_leaderboard_excluded_roles where guild_id = p_guild_id;
  insert into public.discord_leveling_leaderboard_excluded_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, value #>> '{}', now()
  from jsonb_array_elements(p_leaderboard_excluded_role_ids);
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

  update public.discord_leveling_members
  set total_xp = 0,
      level = 0,
      last_xp_awarded_at = null,
      updated_at = now()
  where guild_id = p_guild_id
    and discord_user_id = p_discord_user_id;
end;
$$;

revoke all on function public.replace_discord_leveling_settings(text, boolean, integer, integer, boolean, text, text, text, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.reset_discord_chat_xp(text, text) from public;
grant execute on function public.replace_discord_leveling_settings(text, boolean, integer, integer, boolean, text, text, text, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.reset_discord_chat_xp(text, text) to service_role;

notify pgrst, 'reload schema';

commit;
