alter table public.profiles
  add column if not exists chat_border text not null default 'none';

alter table public.profiles
  drop constraint if exists profiles_chat_border_allowed;

alter table public.profiles
  add constraint profiles_chat_border_allowed
  check (
    chat_border in (
      'none',
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
