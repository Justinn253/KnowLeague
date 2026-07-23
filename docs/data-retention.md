# Data-retention runbook

KnowLeague stores live multiplayer state and short-term product history, not an indefinite event archive. Migration `072_application_data_retention.sql` adds `public.prune_application_data(batch_size)` and schedules it hourly through Supabase Cron. Each run is capped at 500 ordinary records and 100 lobbies per table (a manual run is capped at 1,000), which keeps cleanup predictable and avoids turning a single retention run into a long lock.

## Retention policy

| Data | Retention | Cleanup behavior |
| --- | --- | --- |
| Waiting multiplayer lobbies | 2 days | Deletes stale lobbies. |
| Finished or terminated lobbies | 30 days | Deletes the lobby and cascades its players, actions/submissions, events, chat, bans, and votes. |
| Active multiplayer lobbies | 7 days with no player seen in the last day | Removes only abandoned games. |
| Friend messages | 30 days | Preserves the existing product retention period. |
| Friend requests | Pending: 30 days; resolved: 90 days | Removes stale social-request history. |
| Riot searches and profile metrics | 180 days since last search | Keeps suggestion and percentile data current without retaining arbitrary account lookups forever. |
| Solo quiz attempts | 45 days | The application only reads the current day’s attempts. |
| Solo and Splash Scramble daily leaderboard entries | 120 days | Preserves a four-month diagnostic window; current UI reads the active daily board. |
| Contact feedback, bug reports, and suggestions | 365 days after closed/archived, severity 1–2 only | Removes low-risk resolved tickets. |

Unresolved tickets, all `player_report` records, and higher-severity contact records are intentionally excluded. There is no separate moderation-action history table in the current schema. Set a reviewed legal/compliance policy before adding any automatic deletion for those records.

## Deployment

1. Enable **Cron** in the Supabase Dashboard’s Integrations area before applying the migration.
2. Review the retention table above with the product owner, particularly the 30-day lobby/chat and 365-day low-severity contact windows.
3. Apply the pending migrations through the normal deployment process.
4. Confirm both jobs exist:

```sql
select jobname, schedule, command
from cron.job
where jobname in ('knowleague-prune-application-data', 'knowleague-prune-cron-history');
```

The application cleanup runs hourly at `:15` and the Cron execution-history cleanup runs Sundays at `04:45` (database timezone). `pg_cron` does not purge its own run history automatically, so the second job prevents its metadata from becoming another source of disk growth.

If Cron was enabled after migration `072` was applied, run the scheduling block from that migration once in the Supabase SQL editor after reviewing it. Do not create duplicate jobs.

## Monitoring and adjustment

- Inspect `cron.job_run_details` after the first run and alert on failed jobs.
- The cleanup function returns a JSON object with deletion counts when invoked manually by an administrator; use a small batch size only in a maintenance window.
- If a table has a large backlog, allow repeated hourly batches to drain it instead of increasing the batch beyond 1,000.
- Reclaiming disk from substantial historical deletes may require normal PostgreSQL vacuum maintenance; retention prevents continued growth but does not instantly shrink allocated storage.

Supabase Cron can execute database functions directly, without an HTTP function invocation. Follow Supabase’s [Cron guidance](https://supabase.com/docs/guides/cron) and its [safe data-deletion guidance](https://supabase.com/docs/guides/database/postgres/data-deletion) when changing schedules or retention windows.

## Aggregation and upserts already in use

The high-volume current-state paths already avoid append-only growth:

- Riot account searches and Riot profile metrics upsert on their natural keys.
- Solo and Splash Scramble daily leaderboard entries allow one row per user and day.
- Splash Scramble skin solves aggregate into a per-skin counter.
- Per-user game state, profile settings, friend read markers, and achievement progress upsert into single current-state rows.

Lobby events remain append-only only while a lobby is live because Realtime consumers use them as synchronization signals. Their parent-lobby cascade removes the complete event history after retention.
