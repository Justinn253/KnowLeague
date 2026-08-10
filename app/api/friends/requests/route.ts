import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { createFriendRequest, createFriendRequestByUsername } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { recordAchievementEvent } from '@/lib/achievements-server';

type FriendRequestBody = {
  targetUserId?: string;
  targetUsername?: string;
};

export const runtime = 'nodejs';
const friendRequestRateLimit = getDualRateLimit('friendRequest');

export const POST = withApiMetrics('/api/friends/requests', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'friends:request',
      ip: friendRequestRateLimit.ip,
      subject: { id: userId, ...friendRequestRateLimit.subject },
      errorMessage: 'Too many friend requests. Please try again shortly.',
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await readJsonBody<FriendRequestBody>(request);
    const status = body.targetUsername
      ? await createFriendRequestByUsername(userId, requireString(body.targetUsername, 'targetUsername'))
      : await createFriendRequest(userId, requireString(body.targetUserId, 'targetUserId'));
    // The request mutation is the shared authoritative success point for all
    // friend-request entry points. Achievement persistence should not make a
    // successful friend request fail if an older deployment lacks its table.
    try {
      await recordAchievementEvent(userId, 'friend_added');
    } catch {
      // The achievement can be retried on the next profile refresh/request.
    }
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
