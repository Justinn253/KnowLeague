alter table public.riftbound_post_comments
  add column if not exists like_count integer not null default 0 check (like_count >= 0),
  add column if not exists dislike_count integer not null default 0 check (dislike_count >= 0);

create index if not exists riftbound_post_comments_parent_idx
  on public.riftbound_post_comments(post_id, parent_id, created_at desc, id desc);

create table if not exists public.riftbound_post_comment_reactions (
  comment_id uuid not null references public.riftbound_post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists riftbound_post_comment_reactions_user_idx
  on public.riftbound_post_comment_reactions(user_id, updated_at desc);

alter table public.riftbound_post_comment_reactions enable row level security;
revoke all on table public.riftbound_post_comment_reactions from anon, authenticated;
grant select, insert, update, delete on table public.riftbound_post_comment_reactions to service_role;

create or replace function public.react_riftbound_comment(
  p_comment_id uuid,
  p_user_id uuid,
  p_reaction text
)
returns table (
  like_count integer,
  dislike_count integer,
  reaction text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reaction is not null and p_reaction not in ('like', 'dislike') then
    raise exception 'Invalid comment reaction.';
  end if;

  if p_reaction is null then
    delete from public.riftbound_post_comment_reactions
    where comment_id = p_comment_id and user_id = p_user_id;
  else
    insert into public.riftbound_post_comment_reactions (comment_id, user_id, reaction_type)
    values (p_comment_id, p_user_id, p_reaction)
    on conflict (comment_id, user_id) do update
      set reaction_type = excluded.reaction_type,
          updated_at = now();
  end if;

  update public.riftbound_post_comments as comments
  set like_count = (
        select count(*)::integer
        from public.riftbound_post_comment_reactions as reactions
        where reactions.comment_id = comments.id and reactions.reaction_type = 'like'
      ),
      dislike_count = (
        select count(*)::integer
        from public.riftbound_post_comment_reactions as reactions
        where reactions.comment_id = comments.id and reactions.reaction_type = 'dislike'
      ),
      updated_at = now()
  where comments.id = p_comment_id;

  return query
  select comments.like_count,
         comments.dislike_count,
         reactions.reaction_type
  from public.riftbound_post_comments as comments
  left join public.riftbound_post_comment_reactions as reactions
    on reactions.comment_id = comments.id and reactions.user_id = p_user_id
  where comments.id = p_comment_id;
end;
$$;

revoke all on function public.react_riftbound_comment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.react_riftbound_comment(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
