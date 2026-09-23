-- Keep legacy combined details intact; the application displays them as Notes.
alter table public.custom_augments
  add column quest_requirements text not null default '' check (length(quest_requirements) <= 1200),
  add column restrictions text not null default '' check (length(restrictions) <= 1200),
  add column notes text not null default '' check (length(notes) <= 1200);

-- Existing service-role-only grants and RLS continue to protect these columns.
notify pgrst, 'reload schema';
