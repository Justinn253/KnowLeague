alter table public.skincognito_lobbies
  add column if not exists return_to_lobby_at timestamptz;
