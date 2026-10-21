begin;

-- Retain legacy single-channel columns during the coordinated rollout so an
-- older bot process continues to enforce one selected channel until replaced.
create table if not exists public.discord_general_command_channels (
  guild_id text not null references public.discord_general_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

create table if not exists public.discord_skin_claim_command_channels (
  guild_id text not null references public.discord_skin_claim_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  primary key (guild_id, channel_id)
);

insert into public.discord_general_command_channels (guild_id, channel_id)
select guild_id, default_command_channel_id
from public.discord_general_settings
where default_command_channel_id is not null
on conflict (guild_id, channel_id) do nothing;

insert into public.discord_skin_claim_command_channels (guild_id, channel_id)
select guild_id, command_channel_id
from public.discord_skin_claim_settings
where command_channel_id is not null
on conflict (guild_id, channel_id) do nothing;

alter table public.discord_general_command_channels enable row level security;
alter table public.discord_skin_claim_command_channels enable row level security;
revoke all on table public.discord_general_command_channels from anon, authenticated;
revoke all on table public.discord_skin_claim_command_channels from anon, authenticated;
grant select, insert, update, delete on table public.discord_general_command_channels to service_role;
grant select, insert, update, delete on table public.discord_skin_claim_command_channels to service_role;

create or replace function public.replace_discord_general_command_channels(
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
    raise exception 'Provide up to 100 General command channels.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    where selected.channel_id !~ '^[0-9]{17,20}$'
  ) then
    raise exception 'Each General command channel must be a valid Discord channel.';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_command_channel_ids))
    <> (select count(distinct channel_id) from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)) then
    raise exception 'Each General command channel can only be selected once.';
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
    raise exception 'Every General command channel must be a currently sendable Discord text channel.';
  end if;

  update public.discord_general_settings
  set default_command_channel_id = (
        select min(selected.channel_id)
        from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
      ),
      updated_by = p_updated_by,
      updated_at = now()
  where guild_id = p_guild_id;
  if not found then
    raise exception 'Discord General settings have not been configured.';
  end if;

  delete from public.discord_general_command_channels where guild_id = p_guild_id;
  insert into public.discord_general_command_channels (guild_id, channel_id)
  select p_guild_id, selected.channel_id
  from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
  order by selected.channel_id;
end;
$$;

create or replace function public.replace_discord_skin_claim_command_channels(
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
    raise exception 'Provide up to 100 Collections command channels.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
    where selected.channel_id !~ '^[0-9]{17,20}$'
  ) then
    raise exception 'Each Collections command channel must be a valid Discord channel.';
  end if;
  if (select count(*) from jsonb_array_elements_text(p_command_channel_ids))
    <> (select count(distinct channel_id) from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)) then
    raise exception 'Each Collections command channel can only be selected once.';
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
    raise exception 'Every Collections command channel must be a currently sendable Discord text channel.';
  end if;

  update public.discord_skin_claim_settings
  set command_channel_id = (
        select min(selected.channel_id)
        from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
      ),
      updated_by = p_updated_by,
      updated_at = now()
  where guild_id = p_guild_id;
  if not found then
    raise exception 'Discord skin-claim settings have not been configured.';
  end if;

  delete from public.discord_skin_claim_command_channels where guild_id = p_guild_id;
  insert into public.discord_skin_claim_command_channels (guild_id, channel_id)
  select p_guild_id, selected.channel_id
  from jsonb_array_elements_text(p_command_channel_ids) as selected(channel_id)
  order by selected.channel_id;
end;
$$;

revoke all on function public.replace_discord_general_command_channels(text, jsonb, uuid) from public;
revoke all on function public.replace_discord_skin_claim_command_channels(text, jsonb, uuid) from public;
grant execute on function public.replace_discord_general_command_channels(text, jsonb, uuid) to service_role;
grant execute on function public.replace_discord_skin_claim_command_channels(text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
