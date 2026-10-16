begin;

alter table public.discord_leveling_settings
  add column if not exists level_up_message_enabled boolean not null default true,
  add column if not exists level_up_message_template text not null default '🎉 {user} reached level {level}!';

alter table public.discord_leveling_settings
  drop constraint if exists discord_leveling_settings_level_up_message_template_check;

alter table public.discord_leveling_settings
  add constraint discord_leveling_settings_level_up_message_template_check
  check (char_length(btrim(level_up_message_template)) between 1 and 500);

create table if not exists public.discord_leveling_staff_roles (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

alter table public.discord_leveling_staff_roles enable row level security;
revoke all on table public.discord_leveling_staff_roles from anon, authenticated;
grant select, insert, update, delete on table public.discord_leveling_staff_roles to service_role;

drop function if exists public.replace_discord_leveling_settings(text, boolean, integer, integer, uuid, jsonb);

create or replace function public.replace_discord_leveling_settings(
  p_guild_id text,
  p_enabled boolean,
  p_xp_per_message integer,
  p_cooldown_seconds integer,
  p_level_up_message_enabled boolean,
  p_level_up_message_template text,
  p_updated_by uuid,
  p_role_rewards jsonb,
  p_manual_xp_role_ids jsonb
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
  if char_length(btrim(p_level_up_message_template)) not between 1 and 500 then
    raise exception 'Level-up message templates must contain between 1 and 500 characters.';
  end if;
  if jsonb_typeof(p_role_rewards) <> 'array' or jsonb_array_length(p_role_rewards) > 50 then
    raise exception 'Provide between zero and fifty role rewards.';
  end if;
  if jsonb_typeof(p_manual_xp_role_ids) <> 'array' or jsonb_array_length(p_manual_xp_role_ids) > 25 then
    raise exception 'Provide between zero and twenty-five manual XP staff roles.';
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
    select count(*) from jsonb_array_elements(p_role_rewards)
  ) <> (
    select count(distinct value->>'roleId') from jsonb_array_elements(p_role_rewards)
  ) then
    raise exception 'Each Discord role can have only one level reward.';
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

  insert into public.discord_leveling_settings (
    guild_id,
    enabled,
    xp_per_message,
    cooldown_seconds,
    level_up_message_enabled,
    level_up_message_template,
    updated_by,
    updated_at
  )
  values (
    p_guild_id,
    p_enabled,
    p_xp_per_message,
    p_cooldown_seconds,
    p_level_up_message_enabled,
    btrim(p_level_up_message_template),
    p_updated_by,
    now()
  )
  on conflict (guild_id) do update
  set enabled = excluded.enabled,
      xp_per_message = excluded.xp_per_message,
      cooldown_seconds = excluded.cooldown_seconds,
      level_up_message_enabled = excluded.level_up_message_enabled,
      level_up_message_template = excluded.level_up_message_template,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_leveling_role_rewards where guild_id = p_guild_id;
  insert into public.discord_leveling_role_rewards (guild_id, discord_role_id, level, updated_at)
  select p_guild_id, value->>'roleId', (value->>'level')::integer, now()
  from jsonb_array_elements(p_role_rewards);

  delete from public.discord_leveling_staff_roles where guild_id = p_guild_id;
  insert into public.discord_leveling_staff_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, value #>> '{}', now()
  from jsonb_array_elements(p_manual_xp_role_ids);
end;
$$;

create or replace function public.discord_total_xp_for_level(p_level integer)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
declare
  v_total_xp bigint := 0;
  v_current_level integer;
begin
  if p_level not between 1 and 10000 then
    raise exception 'Level must be between 1 and 10000.';
  end if;

  for v_current_level in 1..(p_level - 1)
  loop
    v_total_xp := v_total_xp + 50::bigint * v_current_level * v_current_level - 100::bigint * v_current_level + 150;
  end loop;
  return v_total_xp;
end;
$$;

create or replace function public.add_discord_chat_xp(
  p_guild_id text,
  p_discord_user_id text,
  p_xp_amount integer
)
returns table (previous_level integer, current_level integer, total_xp bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
  v_current_level integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_xp_amount not between 1 and 1000000 then
    raise exception 'XP amount must be between 1 and 1000000.';
  end if;
  if not exists (select 1 from public.discord_leveling_settings where guild_id = p_guild_id) then
    raise exception 'Discord chat leveling is not initialized for this guild.';
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select * into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;

  v_total_xp := v_member.total_xp + p_xp_amount;
  v_current_level := public.discord_level_for_total_xp(v_total_xp);

  update public.discord_leveling_members
  set total_xp = v_total_xp, level = v_current_level, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;

  return query select v_member.level, v_current_level, v_total_xp;
end;
$$;

create or replace function public.set_discord_chat_level(
  p_guild_id text,
  p_discord_user_id text,
  p_level integer
)
returns table (previous_level integer, current_level integer, total_xp bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.discord_leveling_members%rowtype;
  v_total_xp bigint;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and user identifiers must be valid snowflakes.';
  end if;
  if p_level not between 1 and 10000 then
    raise exception 'Level must be between 1 and 10000.';
  end if;
  if not exists (select 1 from public.discord_leveling_settings where guild_id = p_guild_id) then
    raise exception 'Discord chat leveling is not initialized for this guild.';
  end if;

  insert into public.discord_leveling_members (guild_id, discord_user_id)
  values (p_guild_id, p_discord_user_id)
  on conflict (guild_id, discord_user_id) do nothing;

  select * into v_member
  from public.discord_leveling_members
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id
  for update;

  v_total_xp := public.discord_total_xp_for_level(p_level);
  update public.discord_leveling_members
  set total_xp = v_total_xp, level = p_level, updated_at = now()
  where guild_id = p_guild_id and discord_user_id = p_discord_user_id;

  return query select v_member.level, p_level, v_total_xp;
end;
$$;

revoke all on function public.replace_discord_leveling_settings(text, boolean, integer, integer, boolean, text, uuid, jsonb, jsonb) from public;
revoke all on function public.discord_total_xp_for_level(integer) from public;
revoke all on function public.add_discord_chat_xp(text, text, integer) from public;
revoke all on function public.set_discord_chat_level(text, text, integer) from public;
grant execute on function public.replace_discord_leveling_settings(text, boolean, integer, integer, boolean, text, uuid, jsonb, jsonb) to service_role;
grant execute on function public.add_discord_chat_xp(text, text, integer) to service_role;
grant execute on function public.set_discord_chat_level(text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
