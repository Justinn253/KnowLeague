alter table public.friendships
  add column if not exists user_one_note text not null default '' check (char_length(user_one_note) <= 30),
  add column if not exists user_two_note text not null default '' check (char_length(user_two_note) <= 30),
  add column if not exists user_one_favorite boolean not null default false,
  add column if not exists user_two_favorite boolean not null default false;

create index if not exists friendships_user_one_favorite_idx
  on public.friendships(user_one_id, user_one_favorite)
  where ended_at is null;

create index if not exists friendships_user_two_favorite_idx
  on public.friendships(user_two_id, user_two_favorite)
  where ended_at is null;
