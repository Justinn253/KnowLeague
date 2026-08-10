import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { markFriendMessagesRead } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ReadMessagesBody = {
  friendId: string;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/friends/messages/read', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<ReadMessagesBody>(request);
    await markFriendMessagesRead(userId, requireString(body.friendId, 'friendId'));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
