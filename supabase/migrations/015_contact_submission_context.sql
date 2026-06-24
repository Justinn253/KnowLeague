alter table public.contact_submissions
  add column if not exists username text not null default 'Guest',
  add column if not exists user_uid text not null default 'Guest',
  add column if not exists email text not null default 'Guest',
  add column if not exists viewport text,
  add column if not exists timezone text;

create index if not exists contact_submissions_user_uid_created_idx
  on public.contact_submissions(user_uid, created_at desc);
