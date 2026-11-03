import { withApiMetrics } from '@/lib/api-metrics';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { loadRiftboundMockInventory } from '@/lib/riftbound-mock-inventory';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/mock-inventory', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json(await loadRiftboundMockInventory(userId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
