begin;

-- Website administrators configure the channel that accepts DISBOARD
-- confirmations and the optional recipient of the two-hour reminder.
alter table public.discord_leveling_settings
  add column if not exists disboard_bump_channel_id text
    check (disboard_bump_channel_id is null or disboard_bump_channel_id ~ '^[0-9]{17,20}$'),
  add column if not exists disboard_bump_reminder_user_id text
    check (disboard_bump_reminder_user_id is null or disboard_bump_reminder_user_id ~ '^[0-9]{17,20}$');

commit;
