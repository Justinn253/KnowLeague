create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('feedback', 'bug_report', 'suggestion')),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  client_id text,
  page_path text,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists contact_submissions_status_created_idx
  on public.contact_submissions(status, created_at desc);

alter table public.contact_submissions enable row level security;

grant select, insert, update, delete on table public.contact_submissions to service_role;
