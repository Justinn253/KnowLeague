create table if not exists public.riftbound_post_shares (
  post_id uuid not null references public.riftbound_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists riftbound_post_shares_user_idx
  on public.riftbound_post_shares(user_id, created_at desc);

alter table public.riftbound_post_shares enable row level security;

revoke all on table public.riftbound_post_shares from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_post_shares to service_role;

drop function if exists public.record_riftbound_post_share(uuid);

create or replace function public.record_riftbound_post_share(
  p_post_id uuid,
  p_user_id uuid
)
returns table (
  share_count integer,
  recorded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  did_record boolean := false;
begin
  if p_post_id is null or p_user_id is null then
    raise exception 'A post and user are required.';
  end if;

  perform 1
  from public.riftbound_posts as posts
  where posts.id = p_post_id
    and posts.visibility in ('public', 'unlisted')
  for update;

  if not found then
    raise exception 'Riftbound post not found.';
  end if;

  insert into public.riftbound_post_shares (post_id, user_id)
  values (p_post_id, p_user_id)
  on conflict (post_id, user_id) do nothing;

  if found then
    update public.riftbound_posts
    set share_count = share_count + 1,
        updated_at = now()
    where id = p_post_id;
    did_record := true;
  end if;

  return query
  select posts.share_count, did_record
  from public.riftbound_posts as posts
  where posts.id = p_post_id;
end;
$$;

revoke all on function public.record_riftbound_post_share(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_riftbound_post_share(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
