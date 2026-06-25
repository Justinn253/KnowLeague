alter table public.profiles
  alter column chat_border set default 'black',
  drop constraint if exists profiles_chat_border_allowed;

alter table public.friend_messages
  alter column chat_border set default 'black',
  drop constraint if exists friend_messages_chat_border_allowed;

alter table public.skincognito_chat_messages
  alter column chat_border set default 'black',
  drop constraint if exists skincognito_chat_messages_chat_border_allowed;

update public.profiles
set chat_border = 'black'
where chat_border = 'none';

update public.friend_messages
set chat_border = 'black'
where chat_border = 'none';

update public.skincognito_chat_messages
set chat_border = 'black'
where chat_border = 'none';

alter table public.profiles
  add constraint profiles_chat_border_allowed
  check (
    chat_border in (
      'black',
      'red',
      'orange',
      'amber',
      'gold',
      'chartreuse',
      'emerald',
      'forest',
      'cyan',
      'turquoise',
      'azure',
      'navy',
      'indigo',
      'violet',
      'plum',
      'fuchsia',
      'magenta',
      'salmon',
      'crimson',
      'silver',
      'charcoal'
    )
  );

alter table public.friend_messages
  add constraint friend_messages_chat_border_allowed
  check (
    chat_border in (
      'black',
      'red',
      'orange',
      'amber',
      'gold',
      'chartreuse',
      'emerald',
      'forest',
      'cyan',
      'turquoise',
      'azure',
      'navy',
      'indigo',
      'violet',
      'plum',
      'fuchsia',
      'magenta',
      'salmon',
      'crimson',
      'silver',
      'charcoal'
    )
  );

alter table public.skincognito_chat_messages
  add constraint skincognito_chat_messages_chat_border_allowed
  check (
    chat_border in (
      'black',
      'red',
      'orange',
      'amber',
      'gold',
      'chartreuse',
      'emerald',
      'forest',
      'cyan',
      'turquoise',
      'azure',
      'navy',
      'indigo',
      'violet',
      'plum',
      'fuchsia',
      'magenta',
      'salmon',
      'crimson',
      'silver',
      'charcoal'
    )
  );
