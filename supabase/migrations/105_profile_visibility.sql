alter table public.profiles
  add column if not exists profile_visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_profile_visibility_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_profile_visibility_allowed
      check (profile_visibility in ('public', 'private'));
  end if;
end $$;

notify pgrst, 'reload schema';
