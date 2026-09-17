-- Private, bounded completed-draft history. All access is through authenticated API routes.
create table public.randodraft_history (
  user_id uuid primary key references auth.users(id) on delete cascade,
  drafts jsonb not null default '[]'::jsonb,
  constraint randodraft_history_five_drafts check (
    jsonb_typeof(drafts) = 'array' and jsonb_array_length(drafts) <= 5
  )
);

alter table public.randodraft_history enable row level security;
revoke all on table public.randodraft_history from anon, authenticated;
grant select, insert, update, delete on table public.randodraft_history to service_role;

-- A row lock serializes concurrent completions for one account. Retries keep the
-- original timestamp/order, and every successful write retains only five drafts.
create function public.save_randodraft_history(p_user_id uuid, p_draft jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  saved jsonb;
begin
  if jsonb_typeof(p_draft) is distinct from 'object'
    or p_draft->>'id' is null
    or jsonb_typeof(p_draft->'picks') is distinct from 'array'
    or jsonb_array_length(p_draft->'picks') <> 5 then
    raise exception 'Invalid completed draft.' using errcode = '22023';
  end if;

  insert into public.randodraft_history (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select drafts into saved from public.randodraft_history
    where user_id = p_user_id for update;

  if exists (select 1 from jsonb_array_elements(saved) entry where entry->>'id' = p_draft->>'id') then
    return saved;
  end if;

  select jsonb_agg(entry order by ordinal) into saved
    from jsonb_array_elements(
      jsonb_build_array(p_draft || jsonb_build_object('completedAt', clock_timestamp())) || saved
    ) with ordinality as entries(entry, ordinal)
    where ordinal <= 5;

  update public.randodraft_history set drafts = saved where user_id = p_user_id;
  return saved;
end;
$$;

revoke all on function public.save_randodraft_history(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_randodraft_history(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
