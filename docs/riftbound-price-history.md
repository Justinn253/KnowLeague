# Riftbound price history

Riftbound prices are captured once per day by `/api/cron/riftbound-price-snapshot` and stored in `public.riftbound_card_price_snapshots`. The same transaction stores each user's aggregate collection value and copy counts in `public.riftbound_collection_value_snapshots`.

## Reliability

- The Vercel Cron schedule runs at `11:00 UTC`, after the TCGCSV daily refresh window.
- Source requests use a 15-second timeout and three attempts with exponential backoff.
- The capture validates the full catalogue before writing anything.
- Snapshot writes use one database function, so a failed write cannot leave a partially captured day.
- The primary key makes retries for the same card, finish, date, and source idempotent.
- Collection snapshots are insert-only for each user, local capture date, and source, so a later inventory update cannot rewrite an earlier day's collection state.
- Prices are stored as integer cents. Missing market prices remain explicit `NULL` values with a capture status.
- The catalogue's current price is used only as a clearly marked fallback when a source product cannot be matched.
- Database cleanup retains the latest 365 calendar days for operational snapshots and runs through Supabase Cron at `03:15 UTC`; archive price sources are exempt.
- The one-time TCGCSV archive backfill uses `tcgcsv_archive_daily` for the first 90 days after the Riftbound release date and `tcgcsv_archive_monthly` for later monthly peaks. These rows contain card prices only and never create collection snapshots.

## Deployment

1. Add `CRON_SECRET` to the production environment. Vercel Cron sends it as a bearer token.
2. Apply migrations `076_riftbound_price_snapshots.sql`, `077_riftbound_collection_value_history.sql`, the append-only `089_riftbound_collection_value_snapshots.sql`, and `090_riftbound_archive_price_retention.sql` through the normal Supabase deployment process.
3. Enable Supabase Cron before applying the migration so the retention schedule is installed.
4. Confirm the first successful run at `/api/cron/riftbound-price-snapshot` in the deployment logs.

History is available through:

```text
GET /api/riftbound/prices/{cardId}?days=30
GET /api/riftbound/prices/{cardId}?days=30&finish=foil
GET /api/riftbound/collection/value-history?days=365
```

The card and collection history charts default to 30 days and support 30 days, 3 months, 1 year, or all retained history. Ranges beyond 3 months return one peak-value point per month, which keeps older chart responses small while the daily snapshots remain available as the source of truth for accurate collection captures. The retained-history option currently covers the same 365-day window as the one-year option because database cleanup retains 365 calendar days. Successful card history responses are cached in memory and in a bounded browser cache for six hours. The cache holds at most 100 recently accessed cards, and concurrent opens of the same card and range share one request. Collection history reads the saved daily collection snapshots and can be cached privately for one minute. The card API response is reusable by browser and edge caches for five minutes at the browser and one hour at the edge.

The first successful collection capture establishes the beginning of accurate collection history. Price snapshots from before migration `089` do not contain historical inventory state and are not used to fabricate collection values.

## Historical card-price backfill

`npm run data:import:riftbound-price-history` imports TCGCSV archives from October 31, 2025 onward. The importer is idempotent and can be scoped with `--from` and `--to`; it requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It stores daily card prices through January 28, 2026, then stores only the highest market price observed for each card finish in each month. Migration `090` excludes archive price sources from the normal 365-day cleanup. The import intentionally bypasses `record_riftbound_price_snapshot` because that function also captures user collection values for live cron snapshots.
