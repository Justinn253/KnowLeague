update public.friend_messages as message
set
  chat_color = profile.chat_color,
  chat_border = profile.chat_border
from public.profiles as profile
where message.sender_id = profile.id
  and message.chat_color = 'amber'
  and message.chat_border = 'none';

update public.skincognito_chat_messages as message
set
  chat_color = profile.chat_color,
  chat_border = profile.chat_border
from public.skincognito_players as player
join public.profiles as profile
  on profile.id = player.auth_user_id
where message.player_id = player.id
  and message.message_type = 'player'
  and message.chat_color = 'amber'
  and message.chat_border = 'none';
