-- Keep the profile preference columns writable for authenticated browser clients.
-- The application also writes these settings through the authenticated API route.
grant select on table public.profiles to anon, authenticated;
grant update on table public.profiles to authenticated;
grant update (profile_status, friends_list_public) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

notify pgrst, 'reload schema';
