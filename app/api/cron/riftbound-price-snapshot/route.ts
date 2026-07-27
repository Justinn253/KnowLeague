import { NextResponse } from 'next/server';
import { buildRiftboundPriceSnapshotRows, fetchRiftboundPriceSnapshot } from '@/lib/riftbound-price-source';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { invalidateLatestRiftboundPrices } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRICE_SOURCE = 'tcgcsv';

function isAuthorizedCronRequest(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  return request.headers.get('authorization') === `Bearer ${expectedSecret}`;
}

async function captureSnapshot(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Cron secret is not configured.' }, { status: 503 });
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const setCodes = Array.from(new Set(RIFTBOUND_CARDS.map((card) => card.setCode)));
    const sourceSnapshot = await fetchRiftboundPriceSnapshot(setCodes);
    const rows = buildRiftboundPriceSnapshotRows(RIFTBOUND_CARDS, sourceSnapshot.pricesByPrintKey);
    const expectedRowCount = RIFTBOUND_CARDS.reduce((total, card) => total + card.finishOptions.length, 0);

    if (rows.length !== expectedRowCount || rows.length === 0) {
      throw new Error(`Price snapshot row validation failed: expected ${expectedRowCount}, received ${rows.length}.`);
    }

    const supabase = getSupabaseServiceClient();
    const { data: affectedRows, error } = await supabase.rpc('record_riftbound_price_snapshot', {
      p_snapshot_date: sourceSnapshot.snapshotDate,
      p_source_snapshot_at: sourceSnapshot.sourceSnapshotAt,
      p_source: PRICE_SOURCE,
      p_rows: rows,
    }).returns<number>();

    if (error) throw error;
    invalidateLatestRiftboundPrices();

    const liveCount = rows.filter((row) => row.capture_status === 'live').length;
    const fallbackCount = rows.filter((row) => row.capture_status === 'catalog_fallback').length;
    const unavailableCount = rows.filter((row) => row.capture_status !== 'live' && row.capture_status !== 'catalog_fallback').length;

    return NextResponse.json({
      source: PRICE_SOURCE,
      sourceSnapshotAt: sourceSnapshot.sourceSnapshotAt,
      snapshotDate: sourceSnapshot.snapshotDate,
      cards: RIFTBOUND_CARDS.length,
      rows: rows.length,
      affectedRows: affectedRows ?? rows.length,
      liveCount,
      fallbackCount,
      unavailableCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to capture the Riftbound price snapshot.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  return captureSnapshot(request);
}

export async function POST(request: Request) {
  return captureSnapshot(request);
}
