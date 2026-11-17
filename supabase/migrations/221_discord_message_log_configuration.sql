-- Keep Discord message-log destinations on the existing single-guild companion
-- settings row. A null destination disables that event type without retaining
-- any message data in Supabase.

begin;

alter table public.discord_leveling_settings
  add column if not exists message_delete_log_channel_id text
    check (message_delete_log_channel_id is null or message_delete_log_channel_id ~ '^[0-9]{17,20}$'),
  add column if not exists message_edit_log_channel_id text
    check (message_edit_log_channel_id is null or message_edit_log_channel_id ~ '^[0-9]{17,20}$');

notify pgrst, 'reload schema';
commit;
