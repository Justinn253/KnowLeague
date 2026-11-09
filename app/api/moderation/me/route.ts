import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getAuthenticatedAppRole } from '@/lib/moderation';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS } from '@/lib/api-utils';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/moderation/me', async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const role = await getAuthenticatedAppRole(user);
    return NextResponse.json({ role }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
