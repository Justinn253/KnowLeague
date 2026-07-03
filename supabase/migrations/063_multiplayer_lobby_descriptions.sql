alter table public.multiplayer_quiz_lobbies
add column if not exists lobby_description text not null default '';

alter table public.multiplayer_quiz_lobbies
drop constraint if exists multiplayer_quiz_lobbies_description_length;

alter table public.multiplayer_quiz_lobbies
add constraint multiplayer_quiz_lobbies_description_length
check (char_length(lobby_description) <= 75);

alter table public.skincognito_lobbies
add column if not exists lobby_description text not null default '';

alter table public.skincognito_lobbies
drop constraint if exists skincognito_lobbies_description_length;

alter table public.skincognito_lobbies
add constraint skincognito_lobbies_description_length
check (char_length(lobby_description) <= 75);

alter table public.carving_revelation_lobbies
add column if not exists lobby_description text not null default '';

alter table public.carving_revelation_lobbies
drop constraint if exists carving_revelation_lobbies_description_length;

alter table public.carving_revelation_lobbies
add constraint carving_revelation_lobbies_description_length
check (char_length(lobby_description) <= 75);

alter table public.category_clash_lobbies
add column if not exists lobby_description text not null default '';

alter table public.category_clash_lobbies
drop constraint if exists category_clash_lobbies_description_length;

alter table public.category_clash_lobbies
add constraint category_clash_lobbies_description_length
check (char_length(lobby_description) <= 75);
