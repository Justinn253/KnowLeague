begin;

-- Collections commands are open by default. A configured channel limits the
-- member-facing command surface without changing automatic drop eligibility.
alter table public.discord_skin_claim_settings
  add column if not exists command_channel_id text
  check (command_channel_id is null or command_channel_id ~ '^[0-9]{17,20}$');

create or replace function public.replace_discord_skin_claim_command_channel(
  p_guild_id text,
  p_command_channel_id text,
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
  if p_command_channel_id is not null and (
    p_command_channel_id !~ '^[0-9]{17,20}$'
    or not exists (
      select 1
      from public.discord_guild_text_channels
      where guild_id = p_guild_id
        and channel_id = p_command_channel_id
        and sendable
    )
  ) then
    raise exception 'The Collections commands channel must be a currently sendable Discord text channel.';
  end if;

  update public.discord_skin_claim_settings
  set command_channel_id = p_command_channel_id,
      updated_by = p_updated_by,
      updated_at = now()
  where guild_id = p_guild_id;
  if not found then
    raise exception 'Discord skin-claim settings have not been configured.';
  end if;
end;
$$;

-- /collections spawn is intentionally a collection-admin exception to both
-- command-channel and automatic-drop-channel scope. The bot verifies that it
-- can send in the invoking channel before attaching the reserved drop; all
-- database-side data validation and the one-live-drop invariant remain here.
create or replace function public.force_reserve_discord_skin_claim_drop(
  p_guild_id text,
  p_channel_id text,
  p_skin_catalog_id text,
  p_skin_name text,
  p_champion_name text,
  p_rarity text,
  p_release_date date,
  p_skin_line text,
  p_image_url text
)
returns table (drop_id bigint, skin_code integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.discord_skin_claim_settings%rowtype;
  v_active_drop public.discord_skin_claim_drops%rowtype;
  v_skin_code integer;
  v_drop_id bigint;
  v_expires_at timestamptz;
  v_attempt integer;
begin
  if p_guild_id !~ '^[0-9]{17,20}$' or p_channel_id !~ '^[0-9]{17,20}$' then
    raise exception 'Discord guild and channel identifiers must be valid snowflakes.';
  end if;
  if p_skin_catalog_id !~ '^[0-9]{1,20}$'
    or char_length(p_skin_name) not between 1 and 150
    or char_length(p_champion_name) not between 1 and 100
    or p_rarity not in ('Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ultimate', 'Transcendent', 'Exalted')
    or p_release_date is null
    or char_length(p_skin_line) not between 1 and 150
    or char_length(p_image_url) not between 8 and 1000
    or p_image_url !~ '^https://' then
    raise exception 'Skin-claim drop data is invalid.';
  end if;

  -- This lock serializes staff spawns with automatic drops. Manual drops do
  -- not advance last_drop_at, preserving the normal automatic schedule.
  select * into v_settings
  from public.discord_skin_claim_settings
  where guild_id = p_guild_id
  for update;
  if not found or not v_settings.enabled then
    return;
  end if;

  select * into v_active_drop
  from public.discord_skin_claim_drops
  where guild_id = p_guild_id and status = 'pending'
  for update;
  if found then
    if v_active_drop.expires_at <= now() then
      update public.discord_skin_claim_drops set status = 'expired' where id = v_active_drop.id;
    elsif v_active_drop.message_id is null and v_active_drop.reserved_at <= now() - interval '2 minutes' then
      update public.discord_skin_claim_drops set status = 'send_failed' where id = v_active_drop.id;
    else
      return;
    end if;
  end if;

  for v_attempt in 1..100
  loop
    v_skin_code := floor(random() * 9000 + 1000)::integer;
    begin
      insert into public.discord_skin_claim_drops as new_drop (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, 'manual', now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning new_drop.id, new_drop.expires_at into v_drop_id, v_expires_at;
      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A live or collected item already owns this four-digit code. Try another.
    end;
  end loop;

  raise exception 'No four-digit skin-claim IDs are currently available.';
end;
$$;

revoke all on function public.replace_discord_skin_claim_command_channel(text, text, uuid) from public;
revoke all on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) from public;
grant execute on function public.replace_discord_skin_claim_command_channel(text, text, uuid) to service_role;
grant execute on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
