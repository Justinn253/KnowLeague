create table if not exists public.riftbound_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists riftbound_sets_user_idx
  on public.riftbound_sets(user_id, created_at);

create table if not exists public.riftbound_set_cards (
  set_id uuid not null references public.riftbound_sets(id) on delete cascade,
  card_id text not null,
  quantity integer not null check (quantity > 0 and quantity <= 1000),
  primary key (set_id, card_id)
);

create index if not exists riftbound_set_cards_card_idx
  on public.riftbound_set_cards(card_id);

alter table public.riftbound_sets enable row level security;
alter table public.riftbound_set_cards enable row level security;

drop policy if exists "Users can read their own Riftbound sets" on public.riftbound_sets;
create policy "Users can read their own Riftbound sets"
  on public.riftbound_sets for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own Riftbound set cards" on public.riftbound_set_cards;
create policy "Users can read their own Riftbound set cards"
  on public.riftbound_set_cards for select
  to authenticated
  using (
    exists (
      select 1
      from public.riftbound_sets as sets
      where sets.id = riftbound_set_cards.set_id
        and sets.user_id = auth.uid()
    )
  );

grant select on table public.riftbound_sets to authenticated;
grant select on table public.riftbound_set_cards to authenticated;
grant select, insert, update, delete on table public.riftbound_sets to service_role;
grant select, insert, update, delete on table public.riftbound_set_cards to service_role;

create or replace function public.create_riftbound_set(
  p_user_id uuid,
  p_name text,
  p_cards jsonb
)
returns table (
  id uuid,
  name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_set_id uuid;
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Set name must be between 1 and 80 characters.';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) = 0 or jsonb_array_length(p_cards) > 1180 then
    raise exception 'A set must contain between 1 and 1180 unique cards.';
  end if;

  if exists (
    select card.card_id
    from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer)
    where card.card_id is null
      or card.quantity is null
      or card.quantity < 1
      or card.quantity > 1000
    group by card.card_id
  ) then
    raise exception 'Set cards contain invalid quantities.';
  end if;

  if exists (
    select card.card_id
    from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer)
    group by card.card_id
    having count(*) > 1
  ) then
    raise exception 'Set cards contain duplicate rows.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if (select count(*) from public.riftbound_sets where user_id = p_user_id) >= 6 then
    raise exception 'You can create up to 6 Riftbound sets.';
  end if;

  insert into public.riftbound_sets (user_id, name)
  values (p_user_id, btrim(p_name))
  returning riftbound_sets.id into created_set_id;

  insert into public.riftbound_set_cards (set_id, card_id, quantity)
  select created_set_id, card.card_id, card.quantity
  from jsonb_to_recordset(p_cards) as card(card_id text, quantity integer);

  return query
  select sets.id, sets.name, sets.created_at
  from public.riftbound_sets as sets
  where sets.id = created_set_id;
end;
$$;

revoke all on function public.create_riftbound_set(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_riftbound_set(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
