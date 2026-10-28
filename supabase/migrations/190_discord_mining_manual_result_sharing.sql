begin;

-- Automatic Mining website panels are retired. Preserve historical event rows,
-- but prevent any pending start/recall panel from being delivered after this
-- migration is applied.
update public.discord_mining_website_panel_events
set delivered_at = now(),
    delivery_claim_id = null,
    last_error = 'Automatic Mining website panels were disabled before delivery.',
    next_attempt_at = now()
where delivered_at is null
  and event_kind in ('started', 'returning');

alter table public.discord_mining_website_panel_events
  drop constraint if exists discord_mining_website_panel_events_event_kind_check;
alter table public.discord_mining_website_panel_events
  add constraint discord_mining_website_panel_events_event_kind_check
  check (event_kind in ('started', 'returning', 'completed'));

-- Keep the old website wrappers callable during a rolling deployment, but
-- remove their notification side effects. The website switches to the base
-- expedition procedures as well, so new code does not depend on these.
create or replace function public.start_discord_mining_website_expedition(
  p_guild_id text,
  p_discord_user_id text,
  p_depth smallint,
  p_descend_duration_ms integer,
  p_outcome_seed integer,
  p_equipment_snapshot jsonb
)
returns table (expedition_id bigint, mining_started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.start_discord_mining_expedition(
    p_guild_id,
    p_discord_user_id,
    p_depth,
    p_descend_duration_ms,
    p_outcome_seed,
    p_equipment_snapshot
  );
end;
$$;

create or replace function public.record_discord_mining_website_return_result(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_discord_mining_return_result(
    p_guild_id,
    p_discord_user_id,
    p_expedition_id,
    p_result
  );
end;
$$;

-- Only a settled expedition may be manually shared. An explicit completed
-- event remains idempotent once per expedition, destination, and player.
create or replace function public.enqueue_discord_mining_website_panel(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_event_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or p_event_kind <> 'completed' then
    raise exception 'Mining website result-share data is invalid.';
  end if;

  if not exists (
    select 1
    from public.discord_mining_expeditions as expeditions
    where expeditions.id = p_expedition_id
      and expeditions.guild_id = p_guild_id
      and expeditions.discord_user_id = p_discord_user_id
      and expeditions.status = 'completed'
      and expeditions.result is not null
  ) then
    raise exception 'Only a completed Mining expedition can be shared.';
  end if;

  insert into public.discord_mining_website_panel_events (
    guild_id, discord_user_id, expedition_id, channel_id, event_kind
  )
  select p_guild_id, p_discord_user_id, p_expedition_id, channels.channel_id, p_event_kind
  from public.discord_mining_website_panel_channels as channels
  where channels.guild_id = p_guild_id
  on conflict (expedition_id, event_kind, channel_id) do nothing;

  return found;
end;
$$;

create function public.share_discord_mining_website_result(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.discord_mining_website_panel_channels as channels
    where channels.guild_id = p_guild_id
  ) then
    raise exception 'Configure at least one website Mining result channel before sharing.';
  end if;

  perform public.enqueue_discord_mining_website_panel(
    p_guild_id,
    p_discord_user_id,
    p_expedition_id,
    'completed'
  );
  return true;
end;
$$;

revoke all on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) from public;
revoke all on function public.start_discord_mining_website_expedition(text, text, smallint, integer, integer, jsonb) from public;
revoke all on function public.record_discord_mining_website_return_result(text, text, bigint, jsonb) from public;
revoke all on function public.share_discord_mining_website_result(text, text, bigint) from public;
grant execute on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) to service_role;
grant execute on function public.start_discord_mining_website_expedition(text, text, smallint, integer, integer, jsonb) to service_role;
grant execute on function public.record_discord_mining_website_return_result(text, text, bigint, jsonb) to service_role;
grant execute on function public.share_discord_mining_website_result(text, text, bigint) to service_role;

notify pgrst, 'reload schema';

commit;
