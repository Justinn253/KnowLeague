import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { loadRiftboundShare } from '@/lib/riftbound-shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/shares/[shareKey]', async function GET(request: Request, { params }: { params: { shareKey: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:share-read',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many Riftbound share requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const snapshot = await loadRiftboundShare(params.shareKey);
    const response = NextResponse.json({ snapshot });
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
