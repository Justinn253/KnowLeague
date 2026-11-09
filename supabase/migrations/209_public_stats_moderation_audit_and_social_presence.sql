-- Public profile statistics are opt-in. The source statistics remain private
-- in profile_private_details; the application exposes a deliberately limited
-- aggregate projection only when this preference is enabled.
alter table public.profiles
  add column if not exists public_stats_enabled boolean not null default false;

-- Presence is operational state, not profile state. Keeping it in a dedicated
-- table prevents heartbeats from invalidating profile, role, or avatar caches.
create table if not exists public.social_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'offline' check (status in ('online', 'away', 'offline')),
  updated_at timestamptz not null default now()
);

create index if not exists social_presence_active_idx
  on public.social_presence (updated_at desc)
  where status <> 'offline';

alter table public.social_presence enable row level security;
revoke all on table public.social_presence from public, anon, authenticated;
grant select (user_id, status, updated_at) on table public.social_presence to authenticated;
grant all on table public.social_presence to service_role;

drop policy if exists "Friends can view social presence" on public.social_presence;
create policy "Friends can view social presence"
  on public.social_presence
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.friendships friendship
      where friendship.ended_at is null
        and (
          (friendship.user_one_id = auth.uid() and friendship.user_two_id = social_presence.user_id)
          or (friendship.user_two_id = auth.uid() and friendship.user_one_id = social_presence.user_id)
        )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.social_presence;
exception
  when duplicate_object then null;
end;

alter table public.contact_submissions
  add column if not exists assigned_staff_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists internal_notes text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table public.contact_submissions
  drop constraint if exists contact_submissions_internal_notes_length_check;

alter table public.contact_submissions
  add constraint contact_submissions_internal_notes_length_check
  check (char_length(internal_notes) <= 4000);

create index if not exists contact_submissions_moderation_queue_idx
  on public.contact_submissions (status, assigned_staff_user_id, created_at desc);

create table if not exists public.staff_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_staff_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 1 and 100),
  target_type text not null check (char_length(trim(target_type)) between 1 and 100),
  target_id text not null check (char_length(trim(target_id)) between 1 and 200),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_audit_logs_created_at_idx
  on public.staff_audit_logs (created_at desc);

create index if not exists staff_audit_logs_target_idx
  on public.staff_audit_logs (target_type, target_id, created_at desc);

alter table public.staff_audit_logs enable row level security;

-- The application writes through the service role after checking staff access.
-- No browser role can read or mutate audit records directly.
revoke all on table public.staff_audit_logs from public, anon, authenticated;
grant select, insert on table public.staff_audit_logs to service_role;
revoke update, delete on table public.staff_audit_logs from service_role;

create or replace function public.prevent_staff_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Staff audit records are immutable.' using errcode = 'P0001';
end;
$$;

drop trigger if exists staff_audit_logs_immutable on public.staff_audit_logs;
create trigger staff_audit_logs_immutable
  before update or delete on public.staff_audit_logs
  for each row
  execute function public.prevent_staff_audit_log_mutation();

-- Preserve the narrow column-level profile access model from migration 127.
grant select (public_stats_enabled) on table public.profiles to anon, authenticated;
grant update (public_stats_enabled) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
