begin;

-- Riftbound commands have their own scope, independent of the General,
-- Collections, Fishing, and Mining command-channel controls. An empty
-- selection intentionally means Riftbound is available throughout the guild.
create table public.discord_riftbound_command_channels (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

alter table public.discord_riftbound_command_channels enable row level security;
revoke all on table public.discord_riftbound_command_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_riftbound_command_channels to service_role;

create function public.replace_discord_riftbound_command_channels(
  p_guild_id text,
  p_command_channel_ids jsonb,
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
  if jsonb_typeof(p_command_channel_ids) <> 'array' or jsonb_array_length(p_command_channel_ids) > 100 then
    raise exception 'Provide up to 100 Riftbound command channels.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    where selected.channel_id !~ '^[0-9]{17,20}$'
  ) then
    raise exception 'Each Riftbound command channel must be a valid Discord channel.';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_command_channel_ids))
    <> (select count(distinct channel_id) from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)) then
    raise exception 'Each Riftbound command channel can only be selected once.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    left join public.discord_guild_text_channels as channels
      on channels.guild_id = p_guild_id
      and channels.channel_id = selected.channel_id
      and channels.sendable
    where channels.channel_id is null
  ) then
    raise exception 'Every Riftbound command channel must be a currently sendable Discord text channel.';
  end if;

  delete from public.discord_riftbound_command_channels
  where guild_id = p_guild_id;

  insert into public.discord_riftbound_command_channels (guild_id, channel_id, updated_at)
  select p_guild_id, selected.channel_id, now()
  from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
  order by selected.channel_id;
end;
$$;

revoke all on function public.replace_discord_riftbound_command_channels(text, jsonb, uuid) from public;
grant execute on function public.replace_discord_riftbound_command_channels(text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
