-- Migration 209 was already recorded in the linked production database before
-- the operational presence table was introduced locally. Keep this repair
-- append-only so existing migration history is never rewritten.
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
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'social_presence'
  ) then
    alter publication supabase_realtime add table public.social_presence;
  end if;
end;
$$;
