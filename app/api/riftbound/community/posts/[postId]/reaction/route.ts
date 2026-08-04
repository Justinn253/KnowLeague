import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { reactToRiftboundPost } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import type { RiftboundPostReaction } from '@/lib/riftbound-community-types';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-reaction',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: userId, limit: 60, windowMs: 60_000 },
      errorMessage: 'Too many reaction updates. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ reaction?: unknown }>(request);
    const reaction = body.reaction === 'like' || body.reaction === 'dislike' ? body.reaction as RiftboundPostReaction : body.reaction === null || body.reaction === undefined ? null : (() => { throw new Error('Invalid post reaction.'); })();
    return NextResponse.json(await reactToRiftboundPost(params.postId, userId, reaction));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
