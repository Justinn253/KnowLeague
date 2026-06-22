alter table public.multiplayer_quiz_lobbies
  add column if not exists ability_slots jsonb not null default '["p", "q", "w", "e", "r"]'::jsonb;

alter table public.multiplayer_quiz_lobbies
  drop constraint if exists multiplayer_quiz_lobbies_ability_slots_check;

alter table public.multiplayer_quiz_lobbies
  add constraint multiplayer_quiz_lobbies_ability_slots_check
  check (
    jsonb_typeof(ability_slots) = 'array'
    and jsonb_array_length(ability_slots) between 1 and 5
    and ability_slots <@ '["p", "q", "w", "e", "r"]'::jsonb
  );
