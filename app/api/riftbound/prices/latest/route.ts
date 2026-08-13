import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { loadLatestRiftboundPrices } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/prices/latest', async function GET(request: Request) {
  try {
    const viewerId = await getOptionalAuthenticatedUserId(request);
    const response = NextResponse.json(await loadLatestRiftboundPrices(undefined, viewerId));
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    if (viewerId) response.headers.set('Vary', 'Authorization');
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load the latest Riftbound market values.' }, { status: 500 });
  }
});
