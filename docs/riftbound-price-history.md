# Riftbound price history

Riftbound prices are captured once per day by `/api/cron/riftbound-price-snapshot` and stored in `public.riftbound_card_price_snapshots`.

## Reliability

- The Vercel Cron schedule runs at `21:15 UTC`, after the TCGCSV daily refresh window.
- Source requests use a 15-second timeout and three attempts with exponential backoff.
- The capture validates the full catalogue before writing anything.
- Snapshot writes use one database function, so a failed write cannot leave a partially captured day.
- The primary key makes retries for the same card, finish, date, and source idempotent.
- Prices are stored as integer cents. Missing market prices remain explicit `NULL` values with a capture status.
- The catalogue's current price is used only as a clearly marked fallback when a source product cannot be matched.
- Database cleanup retains the latest 365 calendar days and runs through Supabase Cron at `03:15 UTC`.

## Deployment

1. Add `CRON_SECRET` to the production environment. Vercel Cron sends it as a bearer token.
2. Apply migrations `076_riftbound_price_snapshots.sql` and `077_riftbound_collection_value_history.sql` through the normal Supabase deployment process.
3. Enable Supabase Cron before applying the migration so the retention schedule is installed.
4. Confirm the first successful run at `/api/cron/riftbound-price-snapshot` in the deployment logs.

History is available through:

```text
GET /api/riftbound/prices/{cardId}?days=30
GET /api/riftbound/prices/{cardId}?days=30&finish=foil
GET /api/riftbound/collection/value-history?days=365
```

The card modal still displays the latest 30 days and caches successful history responses in memory and in a bounded browser cache for six hours. The cache holds at most 100 recently accessed cards, and concurrent opens of the same card share one request. The collection history is aggregated server-side from the saved inventory and can be cached privately for one minute. The card API response is reusable by browser and edge caches for five minutes at the browser and one hour at the edge.

The first successful capture establishes the beginning of the history. No historical values are fabricated when the system has not previously captured them.
