alter table public.skincognito_lobbies
  add column if not exists is_public boolean not null default false;

create index if not exists skincognito_public_lobbies_idx
  on public.skincognito_lobbies(status, is_public, created_at desc);
