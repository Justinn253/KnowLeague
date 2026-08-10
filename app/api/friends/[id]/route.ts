import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { removeFriend, updateFriendPreferences } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';

export const runtime = 'nodejs';

export const DELETE = withApiMetrics('/api/friends/[id]', async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await removeFriend(userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PATCH = withApiMetrics('/api/friends/[id]', async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<{ note?: unknown; favorite?: unknown }>(request);
    await updateFriendPreferences(userId, params.id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
