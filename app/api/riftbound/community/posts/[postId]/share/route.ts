import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { recordRiftboundPostShare } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/riftbound/community/posts/[postId]/share', async function POST(request: Request, { params }: { params: { postId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-share',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 20, windowMs: 60_000 },
      errorMessage: 'Too many share requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    return NextResponse.json(await recordRiftboundPostShare(params.postId, userId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
