begin;

-- Fishing level rewards are distinct from character/chat-level rewards. The
-- top-Fisher assignment is tracked separately so the bot only removes a role
-- it previously granted, never a role assigned by a moderator or another flow.
alter table public.discord_fishing_settings
  add column if not exists top_fisher_role_id text
    check (top_fisher_role_id is null or top_fisher_role_id ~ '^[0-9]{17,20}$');

create table public.discord_fishing_level_role_rewards (
  guild_id text not null references public.discord_fishing_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  level integer not null check (level between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create index discord_fishing_level_role_rewards_guild_level_idx
  on public.discord_fishing_level_role_rewards(guild_id, level asc, discord_role_id asc);

create table public.discord_fishing_top_role_assignments (
  guild_id text primary key references public.discord_fishing_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now()
);

alter table public.discord_fishing_level_role_rewards enable row level security;
alter table public.discord_fishing_top_role_assignments enable row level security;
revoke all on table public.discord_fishing_level_role_rewards from anon, authenticated;
revoke all on table public.discord_fishing_top_role_assignments from anon, authenticated;
grant select, insert, update, delete on table public.discord_fishing_level_role_rewards to service_role;
grant select, insert, update, delete on table public.discord_fishing_top_role_assignments to service_role;

create function public.replace_discord_fishing_role_configuration(
  p_guild_id text,
  p_role_rewards jsonb,
  p_top_fisher_role_id text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward jsonb;
  v_role_ids jsonb;
  v_role_value jsonb;
  v_level integer;
  v_role_id text;
  v_role_count integer := 0;
  v_seen_levels integer[] := '{}';
  v_seen_role_ids text[] := '{}';
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if p_role_rewards is null or jsonb_typeof(p_role_rewards) <> 'array' or jsonb_array_length(p_role_rewards) > 50 then
    raise exception 'Provide up to fifty Fishing reward levels.';
  end if;
  if p_top_fisher_role_id is not null and p_top_fisher_role_id !~ '^[0-9]{17,20}$' then
    raise exception 'Top Fisher role must be a valid Discord role identifier.';
  end if;

  for v_reward in select value from jsonb_array_elements(p_role_rewards)
  loop
    if jsonb_typeof(v_reward) <> 'object'
      or coalesce(v_reward ->> 'level', '') !~ '^[0-9]+$' then
      raise exception 'Each Fishing reward level must be valid.';
    end if;
    v_level := (v_reward ->> 'level')::integer;
    if v_level not between 1 and 10000 then
      raise exception 'Fishing reward levels must be between 1 and 10000.';
    end if;
    if v_level = any(v_seen_levels) then
      raise exception 'Each Fishing reward level can only be configured once.';
    end if;
    v_seen_levels := array_append(v_seen_levels, v_level);

    v_role_ids := v_reward -> 'roleIds';
    if jsonb_typeof(v_role_ids) <> 'array' or jsonb_array_length(v_role_ids) = 0 then
      raise exception 'Each Fishing reward level needs at least one Discord role.';
    end if;
    for v_role_value in select value from jsonb_array_elements(v_role_ids)
    loop
      if jsonb_typeof(v_role_value) <> 'string' then
        raise exception 'Every Fishing reward must use a valid Discord role identifier.';
      end if;
      v_role_id := v_role_value #>> '{}';
      if v_role_id !~ '^[0-9]{17,20}$' then
        raise exception 'Every Fishing reward must use a valid Discord role identifier.';
      end if;
      if v_role_id = any(v_seen_role_ids) then
        raise exception 'A Fishing reward role can only be selected once.';
      end if;
      if not exists (
        select 1
        from public.discord_guild_roles
        where guild_id = p_guild_id
          and role_id = v_role_id
          and assignable
      ) then
        raise exception 'Every Fishing reward role must be assignable by the KnowLeague bot.';
      end if;
      v_seen_role_ids := array_append(v_seen_role_ids, v_role_id);
      v_role_count := v_role_count + 1;
      if v_role_count > 50 then
        raise exception 'Provide up to fifty total Fishing reward roles.';
      end if;
    end loop;
  end loop;

  if p_top_fisher_role_id is not null then
    if not exists (
      select 1
      from public.discord_guild_roles
      where guild_id = p_guild_id
        and role_id = p_top_fisher_role_id
        and assignable
    ) then
      raise exception 'Top Fisher role must be assignable by the KnowLeague bot.';
    end if;
    if p_top_fisher_role_id = any(v_seen_role_ids) then
      raise exception 'Top Fisher role cannot also be a Fishing level reward.';
    end if;
    if exists (
      select 1
      from public.discord_leveling_role_rewards
      where guild_id = p_guild_id and discord_role_id = p_top_fisher_role_id
    ) then
      raise exception 'Top Fisher role cannot also be a chat level reward.';
    end if;
    if exists (
      select 1
      from public.discord_leveling_settings
      where guild_id = p_guild_id and leaderboard_top_role_id = p_top_fisher_role_id
    ) then
      raise exception 'Top Fisher role cannot also be the chat leaderboard champion role.';
    end if;
    if exists (
      select 1
      from public.discord_leveling_staff_roles
      where guild_id = p_guild_id and discord_role_id = p_top_fisher_role_id
    ) or exists (
      select 1
      from public.discord_skin_claim_admin_roles
      where guild_id = p_guild_id and discord_role_id = p_top_fisher_role_id
    ) then
      raise exception 'Top Fisher role must not be a staff role.';
    end if;
  end if;

  insert into public.discord_fishing_settings as settings (
    guild_id, command_all_channels, top_fisher_role_id, updated_by, updated_at
  ) values (
    p_guild_id, true, p_top_fisher_role_id, p_updated_by, now()
  ) on conflict (guild_id) do update
  set top_fisher_role_id = excluded.top_fisher_role_id,
      updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_fishing_level_role_rewards
  where guild_id = p_guild_id;

  insert into public.discord_fishing_level_role_rewards (
    guild_id, discord_role_id, level, updated_at
  )
  select
    p_guild_id,
    roles.value,
    (rewards.value ->> 'level')::integer,
    now()
  from jsonb_array_elements(p_role_rewards) as rewards(value)
  cross join lateral jsonb_array_elements_text(rewards.value -> 'roleIds') as roles(value);
end;
$$;

revoke all on function public.replace_discord_fishing_role_configuration(text, jsonb, text, uuid) from public;
grant execute on function public.replace_discord_fishing_role_configuration(text, jsonb, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
