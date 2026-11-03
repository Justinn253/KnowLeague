import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { fetchRiftboundMockBoxPriceSnapshot } from '@/lib/riftbound-mock-price-source';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  return Boolean(expectedSecret) && request.headers.get('authorization') === `Bearer ${expectedSecret}`;
}

async function captureSnapshot(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Cron secret is not configured.' }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const snapshot = await fetchRiftboundMockBoxPriceSnapshot();
    const { data, error } = await getSupabaseServiceClient().rpc('record_riftbound_mock_box_price_snapshots', {
      p_week_start: snapshot.weekStart,
      p_source_snapshot_at: snapshot.sourceSnapshotAt,
      p_rows: snapshot.rows,
    }).returns<number>();
    if (error) throw error;

    return NextResponse.json({
      affectedRows: data ?? snapshot.rows.length,
      sourceSnapshotAt: snapshot.sourceSnapshotAt,
      weekStart: snapshot.weekStart,
      rows: snapshot.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to capture Riftbound mock box prices.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = withApiMetrics('/api/cron/riftbound-mock-box-price-snapshot', async function GET(request: Request) {
  return captureSnapshot(request);
});

export const POST = withApiMetrics('/api/cron/riftbound-mock-box-price-snapshot', async function POST(request: Request) {
  return captureSnapshot(request);
});
