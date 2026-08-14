create table if not exists public.riftbound_binders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' constraint riftbound_binders_description_length_check check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists riftbound_binders_user_idx
  on public.riftbound_binders(user_id, created_at);

create table if not exists public.riftbound_binder_pages (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null references public.riftbound_binders(id) on delete cascade,
  page_number integer not null check (page_number between 1 and 20),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (binder_id, page_number)
);

create index if not exists riftbound_binder_pages_binder_idx
  on public.riftbound_binder_pages(binder_id, page_number);

create table if not exists public.riftbound_binder_slots (
  page_id uuid not null references public.riftbound_binder_pages(id) on delete cascade,
  slot_index integer not null check (slot_index between 0 and 8),
  card_id text not null,
  finish text not null default 'normal' check (finish in ('normal', 'foil')),
  updated_at timestamptz not null default now(),
  primary key (page_id, slot_index)
);

create index if not exists riftbound_binder_slots_card_idx
  on public.riftbound_binder_slots(card_id);

alter table public.riftbound_binders enable row level security;
alter table public.riftbound_binder_pages enable row level security;
alter table public.riftbound_binder_slots enable row level security;

revoke all on table public.riftbound_binders from anon, authenticated;
revoke all on table public.riftbound_binder_pages from anon, authenticated;
revoke all on table public.riftbound_binder_slots from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_binders to service_role;
grant select, insert, update, delete on table public.riftbound_binder_pages to service_role;
grant select, insert, update, delete on table public.riftbound_binder_slots to service_role;

create or replace function public.create_riftbound_binder(
  p_user_id uuid,
  p_name text,
  p_description text default ''
)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_binder_id uuid;
  binder_limit integer := 4;
  premium boolean := false;
begin
  if p_user_id is null then
    raise exception 'A user is required.';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Binder names must be between 1 and 80 characters.';
  end if;

  if p_description is null or char_length(p_description) > 500 then
    raise exception 'Binder descriptions must be 500 characters or fewer.';
  end if;

  select e.plan = 'premium'
    and e.status = 'active'
    and (e.premium_until is null or e.premium_until > now())
  into premium
  from public.riftbound_entitlements as e
  where e.user_id = p_user_id;

  if coalesce(premium, false) then
    binder_limit := 12;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if (select count(*) from public.riftbound_binders where user_id = p_user_id) >= binder_limit then
    raise exception 'You can create up to % Riftbound binders.', binder_limit;
  end if;

  insert into public.riftbound_binders (user_id, name, description)
  values (p_user_id, btrim(p_name), btrim(coalesce(p_description, '')))
  returning riftbound_binders.id into created_binder_id;

  insert into public.riftbound_binder_pages (binder_id, page_number, name)
  select created_binder_id, page_number, 'Page ' || page_number
  from generate_series(1, 20) as page_number;

  return query
  select b.id, b.name, b.description, b.created_at, b.updated_at
  from public.riftbound_binders as b
  where b.id = created_binder_id;
end;
$$;

revoke all on function public.create_riftbound_binder(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_riftbound_binder(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
