-- Staff moderation can archive a post without destroying its immutable
-- snapshot. Archived posts are hidden from normal community reads and remain
-- readable only through the staff-authorized server path.
alter table public.riftbound_posts
  drop constraint if exists riftbound_posts_visibility_check;

alter table public.riftbound_posts
  add constraint riftbound_posts_visibility_check
    check (visibility in ('public', 'friends', 'unlisted', 'archived', 'removed'));

create index if not exists riftbound_posts_archived_idx
  on public.riftbound_posts(created_at desc, id desc)
  where visibility = 'archived';

notify pgrst, 'reload schema';
