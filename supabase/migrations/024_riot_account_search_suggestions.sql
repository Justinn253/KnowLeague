create table if not exists public.riot_account_searches (
  id bigserial primary key,
  riot_id text not null,
  riot_id_normalized text not null,
  game_name text not null,
  tag_line text not null,
  platform text not null,
  search_count integer not null default 1 check (search_count >= 1),
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  constraint riot_account_searches_unique_search unique (riot_id_normalized, platform)
);

create index if not exists riot_account_searches_lookup_idx
  on public.riot_account_searches (riot_id_normalized text_pattern_ops, search_count desc, last_searched_at desc);

alter table public.riot_account_searches enable row level security;

grant select, insert, update, delete on table public.riot_account_searches to service_role;
grant usage, select on sequence public.riot_account_searches_id_seq to service_role;

create or replace function public.record_riot_account_search(
  search_riot_id text,
  search_game_name text,
  search_tag_line text,
  search_platform text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.riot_account_searches (
    riot_id,
    riot_id_normalized,
    game_name,
    tag_line,
    platform,
    search_count,
    first_searched_at,
    last_searched_at
  )
  values (
    search_riot_id,
    lower(search_riot_id),
    search_game_name,
    search_tag_line,
    upper(search_platform),
    1,
    now(),
    now()
  )
  on conflict (riot_id_normalized, platform)
  do update set
    riot_id = excluded.riot_id,
    game_name = excluded.game_name,
    tag_line = excluded.tag_line,
    platform = excluded.platform,
    search_count = public.riot_account_searches.search_count + 1,
    last_searched_at = now();
$$;

grant execute on function public.record_riot_account_search(text, text, text, text) to service_role;
