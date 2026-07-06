alter table public.contact_submissions
  add column if not exists severity integer not null default 1;

update public.contact_submissions
set status = case
  when status in ('resolved', 'closed') then 'closed'
  when status = 'archived' then 'archived'
  else 'open'
end;

alter table public.contact_submissions
  drop constraint if exists contact_submissions_status_check;

alter table public.contact_submissions
  add constraint contact_submissions_status_check
  check (status in ('open', 'closed', 'archived'));

alter table public.contact_submissions
  alter column status set default 'open';

alter table public.contact_submissions
  drop constraint if exists contact_submissions_severity_check;

alter table public.contact_submissions
  add constraint contact_submissions_severity_check
  check (severity between 1 and 5);

create index if not exists contact_submissions_severity_created_idx
  on public.contact_submissions(severity desc, created_at desc);

notify pgrst, 'reload schema';
