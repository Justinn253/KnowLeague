alter table public.profiles
  add column if not exists active_session_id uuid;

comment on column public.profiles.active_session_id is
  'Supabase Auth session_id currently authorized for this account. Used to sign older clients out.';
