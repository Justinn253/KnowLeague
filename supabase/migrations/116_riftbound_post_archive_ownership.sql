-- Track who archived a post and restore its original audience on unarchive.
-- Existing archived rows predate owner archiving and were created by staff.
alter table public.riftbound_posts
  add column if not exists archived_by uuid,
  add column if not exists archived_by_staff boolean not null default false,
  add column if not exists archived_from_visibility text;

alter table public.riftbound_posts
  drop constraint if exists riftbound_posts_archived_from_visibility_check;

alter table public.riftbound_posts
  add constraint riftbound_posts_archived_from_visibility_check
    check (archived_from_visibility is null or archived_from_visibility in ('public', 'friends', 'unlisted'));

update public.riftbound_posts
set archived_by_staff = true,
    archived_from_visibility = coalesce(archived_from_visibility, 'public')
where visibility = 'archived';

create index if not exists riftbound_posts_author_archived_idx
  on public.riftbound_posts(author_id, created_at desc, id desc)
  where visibility = 'archived';

notify pgrst, 'reload schema';
