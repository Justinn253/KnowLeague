begin;

alter table public.discord_temporary_voice_channels
  add column muted_all boolean not null default false,
  add column muted_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(muted_user_ids) = 'array' and jsonb_array_length(muted_user_ids) <= 97),
  add column unmuted_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(unmuted_user_ids) = 'array' and jsonb_array_length(unmuted_user_ids) <= 97),
  add column deafened_all boolean not null default false,
  add column deafened_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(deafened_user_ids) = 'array' and jsonb_array_length(deafened_user_ids) <= 97),
  add column undeafened_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(undeafened_user_ids) = 'array' and jsonb_array_length(undeafened_user_ids) <= 97),
  add column admin_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(admin_user_ids) = 'array' and jsonb_array_length(admin_user_ids) <= 97),
  add column priority_speaker_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(priority_speaker_user_ids) = 'array' and jsonb_array_length(priority_speaker_user_ids) <= 97),
  add column auto_pings jsonb not null default '[]'::jsonb check (jsonb_typeof(auto_pings) = 'array' and jsonb_array_length(auto_pings) <= 25);

alter table public.discord_temporary_voice_presets
  add column muted_all boolean not null default false,
  add column muted_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(muted_user_ids) = 'array' and jsonb_array_length(muted_user_ids) <= 97),
  add column unmuted_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(unmuted_user_ids) = 'array' and jsonb_array_length(unmuted_user_ids) <= 97),
  add column deafened_all boolean not null default false,
  add column deafened_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(deafened_user_ids) = 'array' and jsonb_array_length(deafened_user_ids) <= 97),
  add column undeafened_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(undeafened_user_ids) = 'array' and jsonb_array_length(undeafened_user_ids) <= 97),
  add column admin_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(admin_user_ids) = 'array' and jsonb_array_length(admin_user_ids) <= 97),
  add column priority_speaker_user_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(priority_speaker_user_ids) = 'array' and jsonb_array_length(priority_speaker_user_ids) <= 97),
  add column auto_pings jsonb not null default '[]'::jsonb check (jsonb_typeof(auto_pings) = 'array' and jsonb_array_length(auto_pings) <= 25);

create table public.discord_temporary_voice_deafen_states (
  channel_id text not null references public.discord_temporary_voice_channels(channel_id) on delete cascade,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now(),
  primary key (channel_id, discord_user_id)
);

alter table public.discord_temporary_voice_deafen_states enable row level security;

revoke all on table public.discord_temporary_voice_deafen_states from anon, authenticated;
grant select, insert, update, delete on table public.discord_temporary_voice_deafen_states to service_role;

notify pgrst, 'reload schema';

commit;
