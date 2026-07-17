create or replace function public.find_auth_user_by_email(search_email text)
returns table(id uuid, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select users.id, users.email_confirmed_at
  from auth.users
  where users.email = lower(trim(search_email))
  limit 1;
$$;

revoke all on function public.find_auth_user_by_email(text) from public;
grant execute on function public.find_auth_user_by_email(text) to service_role;

notify pgrst, 'reload schema';
