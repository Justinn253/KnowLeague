drop policy if exists "Friend requests are readable by participants" on public.friend_requests;
create policy "Friend requests are readable by participants"
  on public.friend_requests for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "Friendships are readable by participants" on public.friendships;
create policy "Friendships are readable by participants"
  on public.friendships for select
  using (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "Friend messages are readable by friendship participants" on public.friend_messages;
create policy "Friend messages are readable by friendship participants"
  on public.friend_messages for select
  using (
    exists (
      select 1
      from public.friendships
      where friend_messages.friendship_id = friendships.id
        and (auth.uid() = friendships.user_one_id or auth.uid() = friendships.user_two_id)
    )
  );

drop policy if exists "Friend message reads are readable by owner" on public.friend_message_reads;
create policy "Friend message reads are readable by owner"
  on public.friend_message_reads for select
  using (auth.uid() = user_id);

grant select on table public.friend_requests to authenticated;
grant select on table public.friendships to authenticated;
grant select on table public.friend_messages to authenticated;
grant select on table public.friend_message_reads to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_messages'
  ) then
    alter publication supabase_realtime add table public.friend_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_message_reads'
  ) then
    alter publication supabase_realtime add table public.friend_message_reads;
  end if;
end $$;
