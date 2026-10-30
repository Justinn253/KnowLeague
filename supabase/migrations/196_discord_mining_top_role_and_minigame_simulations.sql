begin;

-- Managed Mining champion role. The assignment table means the bot removes
-- only the role holder that it previously assigned.
alter table public.discord_mining_command_settings
  add column if not exists top_miner_role_id text
    check (top_miner_role_id is null or top_miner_role_id ~ '^[0-9]{17,20}$');

create table public.discord_mining_top_role_assignments (
  guild_id text primary key references public.discord_mining_command_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now()
);

-- Simulation permission is deliberately explicit and game-specific. No role
-- means the staff-only test commands are unavailable to everyone.
create table public.discord_minigame_simulation_roles (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  game_id text not null check (game_id in ('fishing', 'mining')),
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, game_id, discord_role_id)
);

alter table public.discord_mining_top_role_assignments enable row level security;
alter table public.discord_minigame_simulation_roles enable row level security;
revoke all on table public.discord_mining_top_role_assignments from anon, authenticated;
revoke all on table public.discord_minigame_simulation_roles from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_top_role_assignments to service_role;
grant select, insert, update, delete on table public.discord_minigame_simulation_roles to service_role;

create function public.replace_discord_mining_role_configuration(
  p_guild_id text,
  p_role_rewards jsonb,
  p_top_miner_role_id text,
  p_updated_by uuid
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_top_miner_role_id is not null and p_top_miner_role_id !~ '^[0-9]{17,20}$' then
    raise exception 'Top Miner role must be a valid Discord role identifier.';
  end if;
  if p_top_miner_role_id is not null and not exists (
    select 1 from public.discord_guild_roles where guild_id = p_guild_id and role_id = p_top_miner_role_id and assignable
  ) then raise exception 'Top Miner role must be assignable by the KnowLeague bot.'; end if;
  if p_top_miner_role_id is not null and exists (
    select 1 from public.discord_leveling_role_rewards where guild_id = p_guild_id and discord_role_id = p_top_miner_role_id
  ) then raise exception 'Top Miner role cannot also be a chat level reward.'; end if;
  if p_top_miner_role_id is not null and exists (
    select 1 from public.discord_fishing_level_role_rewards where guild_id = p_guild_id and discord_role_id = p_top_miner_role_id
  ) then raise exception 'Top Miner role cannot also be a Fishing level reward.'; end if;
  if p_top_miner_role_id is not null and exists (
    select 1 from public.discord_fishing_settings where guild_id = p_guild_id and top_fisher_role_id = p_top_miner_role_id
  ) then raise exception 'Top Miner role cannot also be the top Fisher role.'; end if;
  if p_top_miner_role_id is not null and exists (
    select 1 from public.discord_leveling_settings where guild_id = p_guild_id and leaderboard_top_role_id = p_top_miner_role_id
  ) then raise exception 'Top Miner role cannot also be the chat leaderboard champion role.'; end if;
  if p_top_miner_role_id is not null and (exists (
    select 1 from public.discord_leveling_staff_roles where guild_id = p_guild_id and discord_role_id = p_top_miner_role_id
  ) or exists (
    select 1 from public.discord_skin_claim_admin_roles where guild_id = p_guild_id and discord_role_id = p_top_miner_role_id
  )) then raise exception 'Top Miner role must not be a staff role.'; end if;

  perform public.replace_discord_mining_role_configuration(p_guild_id, p_role_rewards, p_updated_by);
  if p_top_miner_role_id is not null and exists (
    select 1 from public.discord_mining_level_role_rewards where guild_id = p_guild_id and discord_role_id = p_top_miner_role_id
  ) then raise exception 'Top Miner role cannot also be a Mining level reward.'; end if;
  insert into public.discord_mining_command_settings as settings (guild_id, command_all_channels, top_miner_role_id, updated_by, updated_at)
  values (p_guild_id, true, p_top_miner_role_id, p_updated_by, now())
  on conflict (guild_id) do update set top_miner_role_id = excluded.top_miner_role_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

create function public.replace_discord_minigame_simulation_roles(
  p_guild_id text,
  p_game_id text,
  p_role_ids text[],
  p_updated_by uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_role_id text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_game_id not in ('fishing', 'mining') then
    raise exception 'Minigame simulation configuration is invalid.';
  end if;
  if coalesce(cardinality(p_role_ids), 0) > 25 or cardinality(p_role_ids) <> cardinality(array(select distinct unnest(p_role_ids))) then
    raise exception 'Provide up to twenty-five unique simulation roles.';
  end if;
  foreach v_role_id in array coalesce(p_role_ids, '{}'::text[]) loop
    if v_role_id !~ '^[0-9]{17,20}$' or not exists (
      select 1 from public.discord_guild_roles where guild_id = p_guild_id and role_id = v_role_id
    ) then raise exception 'Each simulation role must be a currently synced Discord role.'; end if;
  end loop;
  delete from public.discord_minigame_simulation_roles where guild_id = p_guild_id and game_id = p_game_id;
  insert into public.discord_minigame_simulation_roles (guild_id, game_id, discord_role_id, updated_at)
  select p_guild_id, p_game_id, role_id, now() from unnest(coalesce(p_role_ids, '{}'::text[])) as role_id;
end;
$$;

revoke all on function public.replace_discord_mining_role_configuration(text, jsonb, text, uuid) from public;
grant execute on function public.replace_discord_mining_role_configuration(text, jsonb, text, uuid) to service_role;
revoke all on function public.replace_discord_minigame_simulation_roles(text, text, text[], uuid) from public;
grant execute on function public.replace_discord_minigame_simulation_roles(text, text, text[], uuid) to service_role;
notify pgrst, 'reload schema';
commit;
