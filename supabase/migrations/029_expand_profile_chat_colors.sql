alter table public.profiles
  drop constraint if exists profiles_chat_color_allowed;

alter table public.profiles
  add constraint profiles_chat_color_allowed
  check (
    chat_color in (
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
