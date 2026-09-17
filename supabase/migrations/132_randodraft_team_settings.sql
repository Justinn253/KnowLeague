-- Extend Randodraft history validation for configurable team sizes and optional second teams.
create or replace function public.save_randodraft_history(p_user_id uuid, p_draft jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $randodraft_history$
declare
  saved jsonb;
  players_per_team integer;
  expected_picks integer;
  second_team boolean;
begin
  players_per_team := case
    when (p_draft->'settings'->>'playersPerTeam') ~ '^[1-5]$'
      then (p_draft->'settings'->>'playersPerTeam')::integer
    else 5
  end;
  second_team := coalesce((p_draft->'settings'->>'secondTeam')::boolean, false);
  expected_picks := players_per_team * case when second_team then 2 else 1 end;

  if jsonb_typeof(p_draft) is distinct from 'object'
    or p_draft->>'id' is null
    or jsonb_typeof(p_draft->'picks') is distinct from 'array'
    or jsonb_array_length(p_draft->'picks') <> expected_picks
    or expected_picks < 1
    or expected_picks > 10 then
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
$randodraft_history$;

revoke all on function public.save_randodraft_history(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_randodraft_history(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
