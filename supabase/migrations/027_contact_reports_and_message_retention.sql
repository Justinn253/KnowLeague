alter table public.contact_submissions
  drop constraint if exists contact_submissions_category_check;

alter table public.contact_submissions
  add constraint contact_submissions_category_check
  check (category in ('feedback', 'bug_report', 'suggestion', 'player_report'));

alter table public.contact_submissions
  add column if not exists reported_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists reported_username text;

create index if not exists contact_submissions_reported_user_created_idx
  on public.contact_submissions(reported_user_id, created_at desc)
  where reported_user_id is not null;

alter table public.friendships
  add column if not exists ended_at timestamptz;

create index if not exists friendships_active_user_one_idx
  on public.friendships(user_one_id)
  where ended_at is null;

create index if not exists friendships_active_user_two_idx
  on public.friendships(user_two_id)
  where ended_at is null;
