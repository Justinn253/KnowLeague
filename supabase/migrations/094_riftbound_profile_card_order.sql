alter table public.riftbound_profile_favorite_cards
  add column if not exists display_order integer;

alter table public.riftbound_profile_wishlist_cards
  add column if not exists display_order integer;

with ranked_favorites as (
  select
    user_id,
    card_id,
    row_number() over (partition by user_id order by created_at asc, card_id asc) - 1 as next_order
  from public.riftbound_profile_favorite_cards
)
update public.riftbound_profile_favorite_cards as favorites
set display_order = ranked_favorites.next_order
from ranked_favorites
where favorites.user_id = ranked_favorites.user_id
  and favorites.card_id = ranked_favorites.card_id;

with ranked_wishlist as (
  select
    user_id,
    card_id,
    row_number() over (partition by user_id order by created_at asc, card_id asc) - 1 as next_order
  from public.riftbound_profile_wishlist_cards
)
update public.riftbound_profile_wishlist_cards as wishlist
set display_order = ranked_wishlist.next_order
from ranked_wishlist
where wishlist.user_id = ranked_wishlist.user_id
  and wishlist.card_id = ranked_wishlist.card_id;

alter table public.riftbound_profile_favorite_cards
  alter column display_order set default 0,
  alter column display_order set not null;

alter table public.riftbound_profile_wishlist_cards
  alter column display_order set default 0,
  alter column display_order set not null;

create index if not exists riftbound_profile_favorite_cards_order_idx
  on public.riftbound_profile_favorite_cards(user_id, display_order, created_at);

create index if not exists riftbound_profile_wishlist_cards_order_idx
  on public.riftbound_profile_wishlist_cards(user_id, display_order, created_at);
