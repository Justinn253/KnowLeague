grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.skincognito_lobbies to service_role;
grant select, insert, update, delete on table public.skincognito_players to service_role;
grant select, insert, update, delete on table public.skincognito_actions to service_role;
grant select, insert, update, delete on table public.skincognito_chat_messages to service_role;

grant select on table public.skincognito_lobbies to anon, authenticated;
grant select on table public.skincognito_players to anon, authenticated;
grant select on table public.skincognito_actions to anon, authenticated;
grant select on table public.skincognito_chat_messages to anon, authenticated;
