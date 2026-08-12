import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { blockUser, unblockUser } from '@/lib/friends';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/users/[id]/block', async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await blockUser(userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const DELETE = withApiMetrics('/api/users/[id]/block', async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await unblockUser(userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
