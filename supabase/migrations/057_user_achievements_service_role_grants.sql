grant select, insert, update, delete on table public.user_achievements to service_role;

notify pgrst, 'reload schema';
