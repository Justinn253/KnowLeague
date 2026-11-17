begin;

-- These service-role RPCs existed only behind the retired /temp command group.
-- Retain their historical data, but remove the no-longer-supported write paths.
drop function if exists public.backfill_discord_member_lifecycle_snapshots(text, jsonb);
drop function if exists public.import_discord_invite_leaderboard(text, jsonb);
drop function if exists public.import_discord_invited_members(text, text, text, jsonb);

notify pgrst, 'reload schema';

commit;
