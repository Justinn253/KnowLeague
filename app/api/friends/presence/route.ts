import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS, readJsonBody } from '@/lib/api-utils';
import { updateSocialPresence, type SocialPresenceStatus } from '@/lib/friends';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const friendPresenceRateLimit = getDualRateLimit('friendPresence');

type PresenceBody = { status?: unknown };

export const POST = withApiMetrics('/api/friends/presence', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'friend-presence',
      ip: friendPresenceRateLimit.ip,
      subject: { id: userId, ...friendPresenceRateLimit.subject },
      errorMessage: 'Presence is updating too quickly. Please wait a moment.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readJsonBody<PresenceBody>(request);
    const status = body.status;
    if (status !== 'online' && status !== 'away' && status !== 'offline') {
      throw new Error('Invalid presence status.');
    }

    await updateSocialPresence(userId, status as SocialPresenceStatus);
    return new NextResponse(null, { status: 204, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
