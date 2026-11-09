import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS } from '@/lib/api-utils';
import { loadRiftboundBootstrap } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/bootstrap', async function GET(request: Request) {
  try {
    const userId = await getOptionalAuthenticatedUserId(request);
    const payload = await loadRiftboundBootstrap(userId);
    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', userId
      ? PRIVATE_NO_STORE_HEADERS['Cache-Control']
      : 'public, max-age=300, s-maxage=300, stale-while-revalidate=900');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
