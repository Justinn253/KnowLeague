alter table public.profiles
  add column if not exists friend_requests_open boolean not null default true,
  add column if not exists last_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_min_length'
  ) then
    alter table public.profiles
      add constraint profiles_username_min_length check (char_length(username) >= 3);
  end if;
end $$;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friend_requests_pending_unique_idx
  on public.friend_requests(requester_id, addressee_id)
  where status = 'pending';

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references public.profiles(id) on delete cascade,
  user_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_one_id < user_two_id)
);

create unique index if not exists friendships_pair_unique_idx
  on public.friendships(user_one_id, user_two_id);

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists friend_messages_friendship_created_idx
  on public.friend_messages(friendship_id, created_at);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_messages enable row level security;

grant select, insert, update, delete on table public.friend_requests to service_role;
grant select, insert, update, delete on table public.friendships to service_role;
grant select, insert, update, delete on table public.friend_messages to service_role;
