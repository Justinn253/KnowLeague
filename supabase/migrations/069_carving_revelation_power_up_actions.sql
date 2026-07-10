alter table public.carving_revelation_actions
  drop constraint if exists carving_revelation_actions_action_type_check;

alter table public.carving_revelation_actions
  add constraint carving_revelation_actions_action_type_check
  check (action_type in ('draw', 'guess', 'next_round_vote', 'power_up'));
