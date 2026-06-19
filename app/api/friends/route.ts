import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getFriendDashboard } from '@/lib/friends';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const dashboard = await getFriendDashboard(userId);
    return NextResponse.json(dashboard);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
