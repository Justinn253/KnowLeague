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
- Live TCGCSV snapshots also store `low_price_cents` and `high_price_cents`; the card-history API exposes these as `lowPrice` and `highPrice` for the selected market-value point.
- The catalogue's current price is used only as a clearly marked fallback when a source product cannot be matched.
- Database cleanup retains the latest 365 calendar days for operational snapshots and runs through Supabase Cron at `03:15 UTC`; archive price sources are exempt.
- The one-time TCGCSV archive backfill uses `tcgcsv_archive_daily` for the first 90 days after the Riftbound release date and `tcgcsv_archive_monthly` for later monthly peaks. When the archive provides them, these rows retain market, low, and high values for each finish; monthly rows retain the range values from the observation with the highest market price. The import never creates collection snapshots.

## Deployment

1. Add `CRON_SECRET` to the production environment. Vercel Cron sends it as a bearer token.
2. Apply migrations `076_riftbound_price_snapshots.sql`, `077_riftbound_collection_value_history.sql`, the append-only `089_riftbound_collection_value_snapshots.sql`, `090_riftbound_archive_price_retention.sql`, and `101_riftbound_price_ranges.sql` through the normal Supabase deployment process.
3. Enable Supabase Cron before applying the migration so the retention schedule is installed.
4. Confirm the first successful run at `/api/cron/riftbound-price-snapshot` in the deployment logs.

History is available through:

```text
GET /api/riftbound/prices/{cardId}?days=30
GET /api/riftbound/prices/{cardId}?days=30&finish=foil
GET /api/riftbound/collection/value-history?days=365
```

The card and collection history charts default to 30 days and support 30 days, 3 months, 1 year, or all retained history. Ranges beyond 3 months return one peak-market-value point per month, with that point's low/high values included in the hover data, which keeps older chart responses small while the daily snapshots remain available as the source of truth for accurate collection captures. The retained-history option currently covers the same 365-day window as the one-year option because database cleanup retains 365 calendar days. Successful card history responses are cached in memory and in a bounded browser cache for six hours. The cache holds at most 100 recently accessed cards, and concurrent opens of the same card and range share one request. Collection history reads the saved daily collection snapshots and can be cached privately for one minute. The card API response is reusable by browser and edge caches for five minutes at the browser and one hour at the edge.

The first successful collection capture establishes the beginning of accurate collection history. Price snapshots from before migration `089` do not contain historical inventory state and are not used to fabricate collection values.

## Promotional card catalogue

`data/catalogs/riftbound-promos.json` is the checked-in source policy for promotional groups. The generator currently includes only products marked `Rarity=Promo` from TCGCSV groups `PR`, `OPP`, and `JDG`, and gives each record the source product ID so duplicate printed numbers remain distinct.

Run `npm run data:generate:riftbound` (or the combined maintenance command below) to refresh the catalogue. New promo products in those groups flow in automatically. If the source omits a collector number, add a `collectorNumberOverrides` entry rather than guessing a print key. The exact source product ID is also used by live and archive price matching, so value history remains attached to the correct variant.

TCGCSV can publish an image URL while reporting `imageCount=0`; those records are retained so a future source update can supply artwork, but the generated `imageAvailable` flag prevents the application from repeatedly requesting a known-unavailable URL. The shared card-image component also shows an explicit artwork-unavailable state after an unexpected image failure. The current official gallery source does not provide a complete promotional-card image feed, so records without artwork from TCGCSV have no authoritative local fallback.

## Historical card-price backfill

For a catalogue release, use the combined maintenance command so the generated catalogue and archive history use the same card IDs:

```text
npm run data:update:riftbound -- --from YYYY-MM-DD --to YYYY-MM-DD
```

The command refreshes `data/catalogs/riftbound-cards.json` from the official gallery and market sources, then runs the idempotent TCGCSV archive importer. Set `--from` to the new set's release date when backfilling a newly introduced set; archives before a print existed are skipped when no source product matches. Add `--dry-run` to validate the source matching and archive processing without database writes. Review the generated catalogue and deploy it after the command completes. The daily price-snapshot cron automatically captures future prices for every generated card after deployment.

`npm run data:import:riftbound-price-history` imports TCGCSV archives from October 31, 2025 onward. The importer is idempotent and can be scoped with `--from` and `--to`; it requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. It stores daily market, low, and high values through January 28, 2026, then stores only the observation with the highest market price for each card finish in each month, including that observation's low and high values. Migration `090` excludes archive price sources from the normal 365-day cleanup. The import intentionally bypasses `record_riftbound_price_snapshot` because that function also captures user collection values for live cron snapshots.
