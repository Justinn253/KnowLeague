begin;

-- Role bonuses and weekday phenomena are server configuration, separate from
-- permanent Fishing-level role rewards. Expeditions snapshot their applicable
-- modifiers at launch so a later configuration or role change cannot alter an
-- active trip's outcome.
create table public.discord_fishing_bonus_roles (
  guild_id text not null references public.discord_fishing_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create table public.discord_fishing_weekday_phenomena (
  guild_id text not null references public.discord_fishing_settings(guild_id) on delete cascade,
  phenomenon text not null check (phenomenon in (
    'double-xp',
    'double-knowbucks',
    'higher-fish-rarity',
    'shorter-expeditions',
    'extra-crate-loot'
  )),
  weekday smallint not null check (weekday between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, phenomenon, weekday)
);

alter table public.discord_fishing_bonus_roles enable row level security;
alter table public.discord_fishing_weekday_phenomena enable row level security;
revoke all on table public.discord_fishing_bonus_roles from anon, authenticated;
revoke all on table public.discord_fishing_weekday_phenomena from anon, authenticated;
grant select, insert, update, delete on table public.discord_fishing_bonus_roles to service_role;
grant select, insert, update, delete on table public.discord_fishing_weekday_phenomena to service_role;

create function public.replace_discord_fishing_bonus_configuration(
  p_guild_id text,
  p_bonus_role_ids text[],
  p_weekday_phenomena jsonb,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id text;
  v_phenomenon jsonb;
  v_phenomenon_id text;
  v_weekdays jsonb;
  v_weekday_value jsonb;
  v_weekday smallint;
  v_seen_phenomena text[] := '{}';
  v_seen_weekdays smallint[];
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;
  if coalesce(cardinality(p_bonus_role_ids), 0) > 25 then
    raise exception 'Provide up to twenty-five Fishing bonus roles.';
  end if;
  if cardinality(p_bonus_role_ids) <> cardinality(array(select distinct unnest(p_bonus_role_ids))) then
    raise exception 'Each Fishing bonus role can only be selected once.';
  end if;
  foreach v_role_id in array coalesce(p_bonus_role_ids, '{}'::text[])
  loop
    if v_role_id !~ '^[0-9]{17,20}$' or not exists (
      select 1
      from public.discord_guild_roles
      where guild_id = p_guild_id and role_id = v_role_id
    ) then
      raise exception 'Every Fishing bonus role must be currently synced from Discord.';
    end if;
  end loop;

  if p_weekday_phenomena is null
    or jsonb_typeof(p_weekday_phenomena) <> 'array'
    or jsonb_array_length(p_weekday_phenomena) > 5 then
    raise exception 'Provide up to five Fishing weekday phenomena.';
  end if;
  for v_phenomenon in select value from jsonb_array_elements(p_weekday_phenomena)
  loop
    v_phenomenon_id := v_phenomenon ->> 'phenomenon';
    v_weekdays := v_phenomenon -> 'weekdays';
    if jsonb_typeof(v_phenomenon) <> 'object'
      or v_phenomenon_id not in (
        'double-xp',
        'double-knowbucks',
        'higher-fish-rarity',
        'shorter-expeditions',
        'extra-crate-loot'
      )
      or jsonb_typeof(v_weekdays) <> 'array'
      or jsonb_array_length(v_weekdays) = 0 then
      raise exception 'Every Fishing weekday phenomenon must be valid.';
    end if;
    if v_phenomenon_id = any(v_seen_phenomena) then
      raise exception 'Each Fishing weekday phenomenon can only be configured once.';
    end if;
    v_seen_phenomena := array_append(v_seen_phenomena, v_phenomenon_id);
    v_seen_weekdays := '{}';
    for v_weekday_value in select value from jsonb_array_elements(v_weekdays)
    loop
      if jsonb_typeof(v_weekday_value) <> 'number'
        or (v_weekday_value #>> '{}') !~ '^[0-6]$' then
        raise exception 'Fishing phenomenon days must be Sunday through Saturday.';
      end if;
      v_weekday := (v_weekday_value #>> '{}')::smallint;
      if v_weekday = any(v_seen_weekdays) then
        raise exception 'Each Fishing phenomenon day can only be selected once.';
      end if;
      v_seen_weekdays := array_append(v_seen_weekdays, v_weekday);
    end loop;
  end loop;

  insert into public.discord_fishing_settings as settings (
    guild_id, command_all_channels, updated_by, updated_at
  ) values (
    p_guild_id, true, p_updated_by, now()
  ) on conflict (guild_id) do update
  set updated_by = excluded.updated_by,
      updated_at = now();

  delete from public.discord_fishing_bonus_roles
  where guild_id = p_guild_id;
  insert into public.discord_fishing_bonus_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now()
  from unnest(coalesce(p_bonus_role_ids, '{}'::text[])) as role_id;

  delete from public.discord_fishing_weekday_phenomena
  where guild_id = p_guild_id;
  insert into public.discord_fishing_weekday_phenomena (
    guild_id, phenomenon, weekday, updated_at
  )
  select
    p_guild_id,
    phenomena.value ->> 'phenomenon',
    (weekdays.value #>> '{}')::smallint,
    now()
  from jsonb_array_elements(p_weekday_phenomena) as phenomena(value)
  cross join lateral jsonb_array_elements(phenomena.value -> 'weekdays') as weekdays(value);
end;
$$;

revoke all on function public.replace_discord_fishing_bonus_configuration(text, text[], jsonb, uuid) from public;
grant execute on function public.replace_discord_fishing_bonus_configuration(text, text[], jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
