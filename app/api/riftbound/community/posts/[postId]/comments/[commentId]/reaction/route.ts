import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedAppRole, canAccessModeration } from '@/lib/moderation';
import { reactToRiftboundComment } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-server';
import type { RiftboundPostReaction } from '@/lib/riftbound-community-types';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/riftbound/community/posts/[postId]/comments/[commentId]/reaction', async function POST(request: Request, { params }: { params: { postId: string; commentId: string } }) {
  try {
    const viewer = await getAuthenticatedUser(request);
    const userId = viewer.id;
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-comment-reaction',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: userId, limit: 120, windowMs: 60 * 60_000 },
      errorMessage: 'Too many comment reaction updates. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ reaction?: unknown }>(request);
    const reaction = body.reaction === 'like' || body.reaction === 'dislike'
      ? body.reaction as RiftboundPostReaction
      : body.reaction === null || body.reaction === undefined
        ? null
        : (() => { throw new Error('Invalid comment reaction.'); })();
    const isStaff = canAccessModeration(await getAuthenticatedAppRole(viewer));
    return NextResponse.json(await reactToRiftboundComment(params.postId, params.commentId, userId, reaction, isStaff));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
