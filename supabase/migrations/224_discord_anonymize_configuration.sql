begin;

create table public.discord_anonymize_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  all_channels boolean not null default true,
  report_channel_id text check (report_channel_id is null or report_channel_id ~ '^[0-9]{17,20}$'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.discord_anonymize_command_channels (
  guild_id text not null references public.discord_anonymize_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create table public.discord_anonymize_use_roles (
  guild_id text not null references public.discord_anonymize_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

create table public.discord_anonymize_view_roles (
  guild_id text not null references public.discord_anonymize_settings(guild_id) on delete cascade,
  discord_role_id text not null check (discord_role_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_role_id)
);

-- Slash-command text is explicitly submitted for anonymized publication. Keep
-- the author mapping server-only so reporting and authorized identity review
-- remain possible without exposing the author on the public message panel.
create table public.discord_anonymized_messages (
  anonymize_id text primary key check (anonymize_id ~ '^[A-Z0-9]{12}$'),
  guild_id text not null references public.discord_anonymize_settings(guild_id) on delete cascade,
  author_discord_user_id text not null check (author_discord_user_id ~ '^[0-9]{17,20}$'),
  message_content text not null check (char_length(message_content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index discord_anonymized_messages_guild_id_created_at_idx
  on public.discord_anonymized_messages (guild_id, created_at desc);

alter table public.discord_anonymize_settings enable row level security;
alter table public.discord_anonymize_command_channels enable row level security;
alter table public.discord_anonymize_use_roles enable row level security;
alter table public.discord_anonymize_view_roles enable row level security;
alter table public.discord_anonymized_messages enable row level security;

revoke all on table public.discord_anonymize_settings from anon, authenticated;
revoke all on table public.discord_anonymize_command_channels from anon, authenticated;
revoke all on table public.discord_anonymize_use_roles from anon, authenticated;
revoke all on table public.discord_anonymize_view_roles from anon, authenticated;
revoke all on table public.discord_anonymized_messages from anon, authenticated;
grant select, insert, update, delete on table public.discord_anonymize_settings to service_role;
grant select, insert, update, delete on table public.discord_anonymize_command_channels to service_role;
grant select, insert, update, delete on table public.discord_anonymize_use_roles to service_role;
grant select, insert, update, delete on table public.discord_anonymize_view_roles to service_role;
grant select, insert, update, delete on table public.discord_anonymized_messages to service_role;

create function public.replace_discord_anonymize_configuration(
  p_guild_id text,
  p_all_channels boolean,
  p_command_channel_ids jsonb,
  p_report_channel_id text,
  p_use_role_ids text[],
  p_view_role_ids text[],
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
    raise exception 'Provide up to one hundred Anonymize command channels.';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    where selected.channel_id !~ '^[0-9]{17,20}$'
  ) then
    raise exception 'Each Anonymize command channel must be a valid Discord channel.';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_command_channel_ids))
    <> (select count(distinct channel_id) from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)) then
    raise exception 'Each Anonymize command channel can only be selected once.';
  end if;
  if not p_all_channels and jsonb_array_length(p_command_channel_ids) = 0 then
    raise exception 'Choose at least one channel when Anonymize is not enabled in all channels.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    left join public.discord_guild_text_channels as channels
      on channels.guild_id = p_guild_id and channels.channel_id = selected.channel_id and channels.sendable
    where channels.channel_id is null
  ) then
    raise exception 'Every Anonymize command channel must be a currently sendable Discord text channel.';
  end if;
  if p_report_channel_id is not null and (
    p_report_channel_id !~ '^[0-9]{17,20}$'
    or not exists (
      select 1 from public.discord_guild_text_channels
      where guild_id = p_guild_id and channel_id = p_report_channel_id and sendable
    )
  ) then
    raise exception 'The Anonymize report channel must be a currently sendable Discord text channel.';
  end if;
  if coalesce(cardinality(p_use_role_ids), 0) > 25
    or cardinality(p_use_role_ids) <> cardinality(array(select distinct unnest(p_use_role_ids)))
    or coalesce(cardinality(p_view_role_ids), 0) > 25
    or cardinality(p_view_role_ids) <> cardinality(array(select distinct unnest(p_view_role_ids))) then
    raise exception 'Provide up to twenty-five unique Anonymize roles for each permission.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_use_role_ids, '{}'::text[]) || coalesce(p_view_role_ids, '{}'::text[])) as selected(role_id)
    where selected.role_id !~ '^[0-9]{17,20}$'
      or not exists (
        select 1 from public.discord_guild_roles
        where guild_id = p_guild_id and role_id = selected.role_id
      )
  ) then
    raise exception 'Each Anonymize role must be currently synced from Discord.';
  end if;

  insert into public.discord_anonymize_settings as settings (
    guild_id, all_channels, report_channel_id, updated_by, updated_at
  ) values (
    p_guild_id, p_all_channels, p_report_channel_id, p_updated_by, now()
  ) on conflict (guild_id) do update set
    all_channels = excluded.all_channels,
    report_channel_id = excluded.report_channel_id,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  delete from public.discord_anonymize_command_channels where guild_id = p_guild_id;
  insert into public.discord_anonymize_command_channels (guild_id, channel_id, updated_at)
  select p_guild_id, selected.channel_id, now()
  from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id);

  delete from public.discord_anonymize_use_roles where guild_id = p_guild_id;
  insert into public.discord_anonymize_use_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now() from unnest(coalesce(p_use_role_ids, '{}'::text[])) as role_id;

  delete from public.discord_anonymize_view_roles where guild_id = p_guild_id;
  insert into public.discord_anonymize_view_roles (guild_id, discord_role_id, updated_at)
  select p_guild_id, role_id, now() from unnest(coalesce(p_view_role_ids, '{}'::text[])) as role_id;
end;
$$;

revoke all on function public.replace_discord_anonymize_configuration(text, boolean, jsonb, text, text[], text[], uuid) from public;
grant execute on function public.replace_discord_anonymize_configuration(text, boolean, jsonb, text, text[], text[], uuid) to service_role;

notify pgrst, 'reload schema';

commit;
