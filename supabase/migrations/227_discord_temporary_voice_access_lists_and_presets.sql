begin;

alter table public.discord_temporary_voice_channels
  add column excluded_all boolean not null default false,
  add column included_user_ids jsonb not null default '[]'::jsonb check (
    jsonb_typeof(included_user_ids) = 'array'
    and jsonb_array_length(included_user_ids) <= 97
  );

create table public.discord_temporary_voice_presets (
  guild_id text not null references public.discord_temporary_voice_settings(guild_id) on delete cascade,
  owner_discord_user_id text not null check (owner_discord_user_id ~ '^[0-9]{17,20}$'),
  channel_name text not null check (char_length(channel_name) between 1 and 100),
  excluded_user_ids jsonb not null default '[]'::jsonb check (
    jsonb_typeof(excluded_user_ids) = 'array'
    and jsonb_array_length(excluded_user_ids) <= 97
  ),
  excluded_all boolean not null default false,
  included_user_ids jsonb not null default '[]'::jsonb check (
    jsonb_typeof(included_user_ids) = 'array'
    and jsonb_array_length(included_user_ids) <= 97
  ),
  is_locked boolean not null default false,
  maximum_users smallint not null default 0 check (maximum_users between 0 and 99),
  status text check (status is null or char_length(status) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (guild_id, owner_discord_user_id)
);

alter table public.discord_temporary_voice_presets enable row level security;

revoke all on table public.discord_temporary_voice_presets from anon, authenticated;
grant select, insert, update, delete on table public.discord_temporary_voice_presets to service_role;

notify pgrst, 'reload schema';

commit;
