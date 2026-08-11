create table if not exists public.auth_session_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sessions_revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_session_controls enable row level security;

revoke all on table public.auth_session_controls from anon, authenticated;
grant select, insert, update, delete on table public.auth_session_controls to service_role;

comment on table public.auth_session_controls is
  'Server-only controls for revoking all existing sessions without restricting users to one device.';

comment on column public.profiles.active_session_id is
  'Deprecated. Authentication sessions are independently valid across devices.';

revoke update (active_session_id) on table public.profiles from authenticated;

notify pgrst, 'reload schema';
