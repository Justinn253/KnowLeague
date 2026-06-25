alter table public.friend_messages
  add column if not exists chat_color text not null default 'amber',
  add column if not exists chat_border text not null default 'none';

alter table public.skincognito_chat_messages
  add column if not exists chat_color text not null default 'amber',
  add column if not exists chat_border text not null default 'none';

alter table public.friend_messages
  drop constraint if exists friend_messages_chat_color_allowed,
  drop constraint if exists friend_messages_chat_border_allowed;

alter table public.skincognito_chat_messages
  drop constraint if exists skincognito_chat_messages_chat_color_allowed,
  drop constraint if exists skincognito_chat_messages_chat_border_allowed;

alter table public.friend_messages
  add constraint friend_messages_chat_color_allowed
  check (
    chat_color in (
      'red', 'orange', 'amber', 'gold', 'chartreuse',
      'emerald', 'forest', 'cyan', 'turquoise', 'azure',
      'navy', 'indigo', 'violet', 'plum', 'fuchsia',
      'magenta', 'salmon', 'crimson', 'silver', 'charcoal'
    )
  ),
  add constraint friend_messages_chat_border_allowed
  check (
    chat_border in (
      'none', 'red', 'orange', 'amber', 'gold', 'chartreuse',
      'emerald', 'forest', 'cyan', 'turquoise', 'azure',
      'navy', 'indigo', 'violet', 'plum', 'fuchsia',
      'magenta', 'salmon', 'crimson', 'silver', 'charcoal'
    )
  );

alter table public.skincognito_chat_messages
  add constraint skincognito_chat_messages_chat_color_allowed
  check (
    chat_color in (
      'red', 'orange', 'amber', 'gold', 'chartreuse',
      'emerald', 'forest', 'cyan', 'turquoise', 'azure',
      'navy', 'indigo', 'violet', 'plum', 'fuchsia',
      'magenta', 'salmon', 'crimson', 'silver', 'charcoal'
    )
  ),
  add constraint skincognito_chat_messages_chat_border_allowed
  check (
    chat_border in (
      'none', 'red', 'orange', 'amber', 'gold', 'chartreuse',
      'emerald', 'forest', 'cyan', 'turquoise', 'azure',
      'navy', 'indigo', 'violet', 'plum', 'fuchsia',
      'magenta', 'salmon', 'crimson', 'silver', 'charcoal'
    )
  );
