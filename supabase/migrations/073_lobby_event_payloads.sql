-- Compact event payloads let connected clients merge routine state changes
-- without requesting a complete lobby view after every action.
alter table public.multiplayer_quiz_lobby_events
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.skincognito_lobby_events
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.carving_revelation_lobby_events
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.category_clash_lobby_events
  add column if not exists payload jsonb not null default '{}'::jsonb;
