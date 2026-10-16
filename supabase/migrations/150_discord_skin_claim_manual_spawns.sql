begin;

alter table public.discord_skin_claim_drops
  drop constraint if exists discord_skin_claim_drops_trigger_type_check;

alter table public.discord_skin_claim_drops
  add constraint discord_skin_claim_drops_trigger_type_check
  check (trigger_type in ('message', 'timer', 'manual'));

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
  v_eligible_channel_ids text[];
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

  -- This lock serializes manual requests with normal timed and message drops.
  select * into v_settings
  from public.discord_skin_claim_settings
  where guild_id = p_guild_id
  for update;
  if not found or not v_settings.enabled then
    return;
  end if;

  select coalesce(array_agg(channel_id), '{}'::text[]) into v_eligible_channel_ids
  from public.discord_skin_claim_channels
  where guild_id = p_guild_id;
  if p_channel_id is distinct from v_settings.automatic_channel_id
    or not (p_channel_id = any(v_eligible_channel_ids)) then
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
      insert into public.discord_skin_claim_drops (
        guild_id, channel_id, skin_code, skin_catalog_id, skin_name, champion_name, rarity,
        release_date, skin_line, image_url, trigger_type, expires_at
      ) values (
        p_guild_id, p_channel_id, v_skin_code, p_skin_catalog_id, p_skin_name, p_champion_name, p_rarity,
        p_release_date, p_skin_line, p_image_url, 'manual', now() + make_interval(mins => v_settings.claim_window_minutes)
      ) returning id, expires_at into v_drop_id, v_expires_at;

      -- A manual spawn becomes the last drop for subsequent min/max scheduling.
      update public.discord_skin_claim_settings
      set last_drop_at = now(), updated_at = now()
      where guild_id = p_guild_id;

      return query select v_drop_id, v_skin_code, v_expires_at;
      return;
    exception when unique_violation then
      -- A live or collected item already owns this four-digit code. Try another.
    end;
  end loop;

  raise exception 'No four-digit skin-claim IDs are currently available.';
end;
$$;

revoke all on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) from public;
grant execute on function public.force_reserve_discord_skin_claim_drop(text, text, text, text, text, text, date, text, text) to service_role;

notify pgrst, 'reload schema';

commit;
