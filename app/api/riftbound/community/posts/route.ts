import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { createRiftboundPost } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type CreatePostBody = {
  postType?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  title?: unknown;
  body?: unknown;
  visibility?: unknown;
};

export const POST = withApiMetrics('/api/riftbound/community/posts', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post-create',
      ip: { limit: 10, windowMs: 60_000 },
      subject: { id: userId, limit: 20, windowMs: 60 * 60_000 },
      errorMessage: 'Too many Riftbound posts were created. Please try again later.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readJsonBody<CreatePostBody>(request);
    const post = await createRiftboundPost({
      userId,
      postType: body.postType,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      title: body.title,
      body: body.body,
      visibility: body.visibility,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
