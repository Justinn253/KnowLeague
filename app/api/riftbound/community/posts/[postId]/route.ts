import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUser, getAuthenticatedUserId, getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { deleteRiftboundPost, loadRiftboundPost, setRiftboundPostArchiveState, updateRiftboundPost } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/community/posts/[postId]', async function GET(request: Request, { params }: { params: { postId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many community post requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewer = await getOptionalAuthenticatedUser(request);
    const viewerId = viewer?.id ?? null;
    const isStaff = viewer ? canAccessModeration(await getAuthenticatedAppRole(viewer)) : false;
    const post = await loadRiftboundPost(params.postId, viewerId, isStaff);
    const response = NextResponse.json({ post });
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PATCH = withApiMetrics('/api/riftbound/community/posts/[postId]', async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    const userId = user.id;
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post-update',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 60, windowMs: 60_000 },
      errorMessage: 'Too many post updates. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ action?: unknown; title?: unknown; body?: unknown }>(request);
    if (body.action === 'archive' || body.action === 'unarchive') {
      const isStaff = canAccessModeration(await getAuthenticatedAppRole(user));
      const result = await setRiftboundPostArchiveState(params.postId, userId, body.action, isStaff);
      return NextResponse.json({ archived: result.visibility === 'archived', visibility: result.visibility, archivedByStaff: result.archivedByStaff });
    }
    const post = await updateRiftboundPost(params.postId, userId, body.title, body.body);
    return NextResponse.json({ post });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const DELETE = withApiMetrics('/api/riftbound/community/posts/[postId]', async function DELETE(request: Request, { params }: { params: { postId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post-delete',
      ip: { limit: 10, windowMs: 60_000 },
      subject: { id: userId, limit: 20, windowMs: 60 * 60_000 },
      errorMessage: 'Too many posts were deleted. Please try again later.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    await deleteRiftboundPost(params.postId, userId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
