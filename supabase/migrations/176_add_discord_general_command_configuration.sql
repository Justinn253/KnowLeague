begin;

-- General command controls stay separate from feature-specific settings so
-- Fishing, Collections, and future feature command scopes retain precedence.
create table if not exists public.discord_general_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  default_command_channel_id text check (default_command_channel_id is null or default_command_channel_id ~ '^[0-9]{17,20}$'),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.discord_general_settings (guild_id)
select guild_id from public.discord_leveling_settings
on conflict (guild_id) do nothing;

alter table public.discord_general_settings enable row level security;
revoke all on table public.discord_general_settings from anon, authenticated;
grant select, insert, update, delete on table public.discord_general_settings to service_role;

create or replace function public.replace_discord_general_command_channel(
  p_guild_id text,
  p_default_command_channel_id text,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_guild_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild identifier must be valid.';
  end if;

  if p_default_command_channel_id is not null and (
    p_default_command_channel_id !~ '^[0-9]{17,20}$'
    or not exists (
      select 1
      from public.discord_guild_text_channels
      where guild_id = p_guild_id
        and channel_id = p_default_command_channel_id
        and sendable
    )
  ) then
    raise exception 'The General commands channel must be a currently sendable Discord text channel.';
  end if;

  insert into public.discord_general_settings as current (
    guild_id,
    default_command_channel_id,
    updated_by,
    updated_at
  ) values (
    p_guild_id,
    p_default_command_channel_id,
    p_updated_by,
    now()
  )
  on conflict (guild_id) do update
  set default_command_channel_id = excluded.default_command_channel_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.replace_discord_general_command_channel(text, text, uuid) from public;
grant execute on function public.replace_discord_general_command_channel(text, text, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
