-- A failed token leaderboard generation should be retryable immediately.  The
-- previous claim function only reclaimed non-complete rows after ten minutes,
-- which also trapped rows explicitly marked as `error` in the generating state.
do $migration$
declare
  function_oid oid;
  function_definition text;
  updated_definition text;
begin
  for function_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_riot_token_leaderboard_refresh'
  loop
    function_definition := pg_get_functiondef(function_oid);
    updated_definition := regexp_replace(
      function_definition,
      $$status\s*<>\s*'complete'\s+and\s+started_at\s*<\s*now\(\)\s*-\s*interval\s+'10 minutes'$$,
      $$status <> 'complete' and (status = 'error' or started_at < now() - interval '10 minutes')$$,
      1,
      1,
      'n'
    );

    if updated_definition = function_definition then
      raise exception 'Could not update claim_riot_token_leaderboard_refresh (%)', function_oid;
    end if;

    execute updated_definition;
  end loop;
end
$migration$;
