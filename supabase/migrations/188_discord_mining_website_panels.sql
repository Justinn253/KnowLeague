begin;

-- Website-initiated Mining actions need an explicit Discord destination. This
-- is intentionally separate from command-channel scope and level-up notices.
create table public.discord_mining_website_panel_settings (
  guild_id text primary key references public.discord_leveling_settings(guild_id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- A short-lived, durable outbox lets the website request bot-authenticated
-- message delivery without ever receiving a Discord bot token. One event is
-- emitted per website start or recall action.
create table public.discord_mining_website_panel_events (
  id bigint generated always as identity primary key,
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  expedition_id bigint not null references public.discord_mining_expeditions(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[0-9]{17,20}$'),
  event_kind text not null check (event_kind in ('started', 'returning')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  delivery_claim_id text check (delivery_claim_id is null or delivery_claim_id ~ '^[a-zA-Z0-9-]{1,64}$'),
  discord_message_id text check (discord_message_id is null or discord_message_id ~ '^[0-9]{17,20}$'),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (expedition_id, event_kind)
);

create index discord_mining_website_panel_events_pending_idx
  on public.discord_mining_website_panel_events (guild_id, next_attempt_at, id)
  where delivered_at is null;

alter table public.discord_mining_website_panel_settings enable row level security;
alter table public.discord_mining_website_panel_events enable row level security;
revoke all on table public.discord_mining_website_panel_settings from anon, authenticated;
revoke all on table public.discord_mining_website_panel_events from anon, authenticated;
grant select, insert, update, delete on table public.discord_mining_website_panel_settings to service_role;
grant select, insert, update, delete on table public.discord_mining_website_panel_events to service_role;

create function public.enqueue_discord_mining_website_panel(
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
declare
  v_channel_id text;
  v_expected_status text;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_discord_user_id !~ '^[0-9]{17,20}$'
    or p_expedition_id < 1 or p_event_kind not in ('started', 'returning') then
    raise exception 'Mining website panel data is invalid.';
  end if;

  v_expected_status := case when p_event_kind = 'started' then 'descending' else 'returning' end;
  if not exists (
    select 1
    from public.discord_mining_expeditions as expeditions
    where expeditions.id = p_expedition_id
      and expeditions.guild_id = p_guild_id
      and expeditions.discord_user_id = p_discord_user_id
      and expeditions.status = v_expected_status
  ) then
    raise exception 'Mining expedition panel state is unavailable.';
  end if;

  select settings.channel_id into v_channel_id
  from public.discord_mining_website_panel_settings as settings
  where settings.guild_id = p_guild_id
  for share;
  if v_channel_id is null then
    return false;
  end if;

  insert into public.discord_mining_website_panel_events (
    guild_id, discord_user_id, expedition_id, channel_id, event_kind
  ) values (
    p_guild_id, p_discord_user_id, p_expedition_id, v_channel_id, p_event_kind
  ) on conflict (expedition_id, event_kind) do nothing;

  return found;
end;
$$;

-- These website-only wrappers preserve the existing bot command procedures
-- while making the state change and notification request one transaction.
create function public.start_discord_mining_website_expedition(
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
declare
  v_started record;
begin
  select * into v_started
  from public.start_discord_mining_expedition(
    p_guild_id,
    p_discord_user_id,
    p_depth,
    p_descend_duration_ms,
    p_outcome_seed,
    p_equipment_snapshot
  );
  perform public.enqueue_discord_mining_website_panel(
    p_guild_id,
    p_discord_user_id,
    v_started.expedition_id,
    'started'
  );
  return query select v_started.expedition_id, v_started.mining_started_at;
end;
$$;

create function public.begin_discord_mining_website_return(
  p_guild_id text,
  p_discord_user_id text,
  p_expedition_id bigint,
  p_ascent_duration_ms integer
)
returns table (
  expedition_id bigint,
  depth smallint,
  mining_started_at timestamptz,
  return_started_at timestamptz,
  returns_at timestamptz,
  outcome_seed integer,
  equipment_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_returning record;
begin
  select * into v_returning
  from public.begin_discord_mining_return(
    p_guild_id,
    p_discord_user_id,
    p_expedition_id,
    p_ascent_duration_ms
  );
  return query select
    v_returning.expedition_id,
    v_returning.depth,
    v_returning.mining_started_at,
    v_returning.return_started_at,
    v_returning.returns_at,
    v_returning.outcome_seed,
    v_returning.equipment_snapshot;
end;
$$;

-- The return panel needs its immutable cargo. Record that result before
-- enqueueing, so the delivery worker never races a website request.
create function public.record_discord_mining_website_return_result(
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
  perform public.record_discord_mining_return_result(
    p_guild_id,
    p_discord_user_id,
    p_expedition_id,
    p_result
  );
  perform public.enqueue_discord_mining_website_panel(
    p_guild_id,
    p_discord_user_id,
    p_expedition_id,
    'returning'
  );
  return true;
end;
$$;

create function public.claim_discord_mining_website_panel_events(
  p_guild_id text,
  p_claim_id text,
  p_limit integer default 10
)
returns table (
  id bigint,
  channel_id text,
  discord_user_id text,
  expedition_id bigint,
  event_kind text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_claim_id !~ '^[a-zA-Z0-9-]{1,64}$'
    or p_limit not between 1 and 25 then
    raise exception 'Mining website panel claim is invalid.';
  end if;

  return query
  with pending as (
    select events.id
    from public.discord_mining_website_panel_events as events
    where events.guild_id = p_guild_id
      and events.delivered_at is null
      and events.next_attempt_at <= now()
    order by events.created_at asc, events.id asc
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.discord_mining_website_panel_events as events
    set attempt_count = events.attempt_count + 1,
        delivery_claim_id = p_claim_id,
        last_attempt_at = now(),
        next_attempt_at = now() + interval '5 minutes',
        last_error = null
    from pending
    where events.id = pending.id
    returning events.id, events.channel_id, events.discord_user_id, events.expedition_id, events.event_kind
  )
  select claimed.id, claimed.channel_id, claimed.discord_user_id, claimed.expedition_id, claimed.event_kind
  from claimed;
end;
$$;

create function public.complete_discord_mining_website_panel_event(
  p_event_id bigint,
  p_claim_id text,
  p_discord_message_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id < 1 or p_claim_id !~ '^[a-zA-Z0-9-]{1,64}$'
    or p_discord_message_id !~ '^[0-9]{17,20}$' then
    raise exception 'Mining website panel completion is invalid.';
  end if;

  update public.discord_mining_website_panel_events as events
  set delivered_at = now(),
      discord_message_id = p_discord_message_id,
      delivery_claim_id = null,
      last_error = null
  where events.id = p_event_id
    and events.delivered_at is null
    and events.delivery_claim_id = p_claim_id;
  if not found then
    raise exception 'Mining website panel claim is no longer current.';
  end if;
end;
$$;

create function public.fail_discord_mining_website_panel_event(
  p_event_id bigint,
  p_claim_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id < 1 or p_claim_id !~ '^[a-zA-Z0-9-]{1,64}$'
    or char_length(btrim(coalesce(p_error, ''))) not between 1 and 500 then
    raise exception 'Mining website panel failure is invalid.';
  end if;

  update public.discord_mining_website_panel_events as events
  set delivery_claim_id = null,
      last_error = btrim(p_error),
      next_attempt_at = now() + interval '5 minutes'
  where events.id = p_event_id
    and events.delivered_at is null
    and events.delivery_claim_id = p_claim_id;
end;
$$;

revoke all on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) from public;
revoke all on function public.start_discord_mining_website_expedition(text, text, smallint, integer, integer, jsonb) from public;
revoke all on function public.begin_discord_mining_website_return(text, text, bigint, integer) from public;
revoke all on function public.record_discord_mining_website_return_result(text, text, bigint, jsonb) from public;
revoke all on function public.claim_discord_mining_website_panel_events(text, text, integer) from public;
revoke all on function public.complete_discord_mining_website_panel_event(bigint, text, text) from public;
revoke all on function public.fail_discord_mining_website_panel_event(bigint, text, text) from public;
grant execute on function public.enqueue_discord_mining_website_panel(text, text, bigint, text) to service_role;
grant execute on function public.start_discord_mining_website_expedition(text, text, smallint, integer, integer, jsonb) to service_role;
grant execute on function public.begin_discord_mining_website_return(text, text, bigint, integer) to service_role;
grant execute on function public.record_discord_mining_website_return_result(text, text, bigint, jsonb) to service_role;
grant execute on function public.claim_discord_mining_website_panel_events(text, text, integer) to service_role;
grant execute on function public.complete_discord_mining_website_panel_event(bigint, text, text) to service_role;
grant execute on function public.fail_discord_mining_website_panel_event(bigint, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
