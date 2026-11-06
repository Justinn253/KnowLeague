import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getFriendDashboard } from '@/lib/friends';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS } from '@/lib/api-utils';

export const runtime = 'nodejs';

const inFlightDashboards = new Map<string, Promise<Awaited<ReturnType<typeof getFriendDashboard>>>>();

function loadFriendDashboard(userId: string) {
  const existingRequest = inFlightDashboards.get(userId);
  if (existingRequest) return existingRequest;

  const request = getFriendDashboard(userId);
  inFlightDashboards.set(userId, request);
  const clearRequest = () => {
    if (inFlightDashboards.get(userId) === request) inFlightDashboards.delete(userId);
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

export const GET = withApiMetrics('/api/friends', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const dashboard = await loadFriendDashboard(userId);
    return NextResponse.json(dashboard, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
