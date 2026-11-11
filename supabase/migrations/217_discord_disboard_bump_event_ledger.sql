-- Keep a durable, idempotent ledger of confirmed DISBOARD bump messages. This
-- lets gateway create/update handling and short history reconciliation coexist
-- without duplicate reminder schedules or confirmations.

begin;

create table if not exists public.discord_disboard_bump_events (
  guild_id text not null references public.discord_leveling_settings(guild_id) on delete cascade,
  source_message_id text not null check (source_message_id ~ '^[0-9]{17,20}$'),
  bumped_at timestamptz not null,
  reminder_due_at timestamptz not null,
  detected_at timestamptz not null default now(),
  reminder_sent_at timestamptz,
  primary key (guild_id, source_message_id)
);

create index if not exists discord_disboard_bump_events_recent_idx
  on public.discord_disboard_bump_events (guild_id, bumped_at desc);

alter table public.discord_disboard_bump_events enable row level security;
revoke all on table public.discord_disboard_bump_events from anon, authenticated;
grant select, insert, update, delete on table public.discord_disboard_bump_events to service_role;

create or replace function public.record_disboard_bump_reminder(
  p_guild_id text,
  p_source_message_id text,
  p_bumped_at timestamptz,
  p_reminder_due_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_recorded boolean := false;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_source_message_id !~ '^[0-9]{17,20}$'
    or p_bumped_at is null or p_reminder_due_at is null or p_reminder_due_at <= p_bumped_at then
    raise exception 'DISBOARD bump reminder data is invalid.';
  end if;

  insert into public.discord_disboard_bump_events (
    guild_id, source_message_id, bumped_at, reminder_due_at
  ) values (
    p_guild_id, p_source_message_id, p_bumped_at, p_reminder_due_at
  ) on conflict (guild_id, source_message_id) do nothing
  returning true into v_recorded;

  if coalesce(v_recorded, false) then
    update public.discord_leveling_settings
    set disboard_bump_reminder_due_at = p_reminder_due_at,
        disboard_bump_reminder_source_message_id = p_source_message_id
    where guild_id = p_guild_id;
  end if;

  return coalesce(v_recorded, false);
end;
$$;

create or replace function public.claim_disboard_bump_reminder(
  p_guild_id text,
  p_source_message_id text,
  p_due_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  update public.discord_leveling_settings
  set disboard_bump_reminder_due_at = null,
      disboard_bump_reminder_source_message_id = null
  where guild_id = p_guild_id
    and disboard_bump_reminder_source_message_id = p_source_message_id
    and disboard_bump_reminder_due_at = p_due_at
    and disboard_bump_reminder_due_at <= now()
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    update public.discord_disboard_bump_events
    set reminder_sent_at = now()
    where guild_id = p_guild_id
      and source_message_id = p_source_message_id
      and reminder_due_at = p_due_at
      and reminder_sent_at is null;
  end if;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.record_disboard_bump_reminder(text, text, timestamptz, timestamptz) from public;
revoke all on function public.claim_disboard_bump_reminder(text, text, timestamptz) from public;
grant execute on function public.record_disboard_bump_reminder(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_disboard_bump_reminder(text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
