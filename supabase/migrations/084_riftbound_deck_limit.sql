create or replace function public.enforce_riftbound_deck_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize inserts for one user so concurrent requests cannot pass the count check together.
  perform pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  if (
    select count(*)
    from public.riftbound_decks as decks
    where decks.user_id = NEW.user_id
  ) >= 6 then
    raise exception 'You can create up to 6 Riftbound game decks.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists riftbound_deck_limit_trigger on public.riftbound_decks;

create trigger riftbound_deck_limit_trigger
before insert on public.riftbound_decks
for each row
execute function public.enforce_riftbound_deck_limit();

revoke all on function public.enforce_riftbound_deck_limit() from public, anon, authenticated;

