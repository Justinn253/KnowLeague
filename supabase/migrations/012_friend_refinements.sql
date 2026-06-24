alter table public.profiles
  add column if not exists is_banned boolean not null default false;

alter table public.skincognito_players
  add column if not exists auth_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.friend_message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, friendship_id)
);

alter table public.friend_message_reads enable row level security;

grant select, insert, update, delete on table public.friend_message_reads to service_role;
