import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId, getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { createRiftboundComment, decodeRiftboundCommentCursor, loadRiftboundComments } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/riftbound/community/posts/[postId]/comments', async function GET(request: Request, { params }: { params: { postId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-comments-read',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many comment requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewer = await getOptionalAuthenticatedUser(request);
    const viewerId = viewer?.id ?? null;
    const isStaff = viewer ? canAccessModeration(await getAuthenticatedAppRole(viewer)) : false;
    const url = new URL(request.url);
    const cursorValue = url.searchParams.get('cursor');
    const cursor = decodeRiftboundCommentCursor(cursorValue);
    if (cursorValue && !cursor) throw new Error('Invalid comment cursor.');
    return NextResponse.json(await loadRiftboundComments(params.postId, cursor, 20, viewerId, isStaff));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/riftbound/community/posts/[postId]/comments', async function POST(request: Request, { params }: { params: { postId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-comment-create',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 60, windowMs: 60 * 60_000 },
      errorMessage: 'Too many comments. Please try again later.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ body?: unknown; parentId?: unknown }>(request);
    return NextResponse.json({ comment: await createRiftboundComment(params.postId, userId, body.body, body.parentId) }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
