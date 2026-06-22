update public.multiplayer_quiz_players as player
set role = 'player'
from public.multiplayer_quiz_lobbies as lobby
where player.lobby_id = lobby.id
  and player.role = 'host'
  and player.id is distinct from lobby.host_player_id;

update public.skincognito_players as player
set role = case
  when player.id = lobby.player_one_id or player.id = lobby.player_two_id then 'opponent'
  else 'spectator'
end
from public.skincognito_lobbies as lobby
where player.lobby_id = lobby.id
  and player.role = 'host'
  and player.id is distinct from lobby.host_player_id;

create unique index if not exists multiplayer_quiz_one_host_per_lobby_idx
  on public.multiplayer_quiz_players(lobby_id)
  where role = 'host';

create unique index if not exists skincognito_one_host_per_lobby_idx
  on public.skincognito_players(lobby_id)
  where role = 'host';

update public.multiplayer_quiz_lobbies
set is_public = false
where status = 'terminated' and is_public = true;

update public.skincognito_lobbies
set is_public = false
where status = 'terminated' and is_public = true;
