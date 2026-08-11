import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { reportRiftboundContent } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/riftbound/community/report', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-report',
      ip: { limit: 10, windowMs: 60_000 },
      subject: { id: userId, limit: 20, windowMs: 60 * 60_000 },
      errorMessage: 'Too many reports. Please try again later.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ postId?: unknown; commentId?: unknown; reason?: unknown; details?: unknown }>(request);
    await reportRiftboundContent({ userId, postId: typeof body.postId === 'string' ? body.postId : undefined, commentId: typeof body.commentId === 'string' ? body.commentId : undefined, reason: body.reason, details: body.details });
    return NextResponse.json({ reported: true }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
