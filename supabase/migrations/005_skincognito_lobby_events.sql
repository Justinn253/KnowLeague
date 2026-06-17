create table if not exists public.skincognito_lobby_events (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.skincognito_lobbies(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists skincognito_lobby_events_lobby_created_idx
  on public.skincognito_lobby_events(lobby_id, created_at);

alter table public.skincognito_lobby_events enable row level security;

grant select, insert, update, delete on table public.skincognito_lobby_events to service_role;
grant select on table public.skincognito_lobby_events to anon, authenticated;

drop policy if exists "Skincognito lobby events are readable" on public.skincognito_lobby_events;
create policy "Skincognito lobby events are readable"
  on public.skincognito_lobby_events
  for select
  to anon, authenticated
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'skincognito_lobby_events'
  ) then
    alter publication supabase_realtime add table public.skincognito_lobby_events;
  end if;
end $$;
