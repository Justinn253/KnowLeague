import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { loadRiftboundInventoryHistory } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/inventory/history', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json({ history: await loadRiftboundInventoryHistory(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
