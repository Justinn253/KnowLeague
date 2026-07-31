import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { deleteRiftboundPost, loadRiftboundPost, updateRiftboundPost } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { postId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many community post requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewerId = await getOptionalAuthenticatedUserId(request);
    const post = await loadRiftboundPost(params.postId, viewerId);
    const response = NextResponse.json({ post });
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-post-update',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 60, windowMs: 60_000 },
      errorMessage: 'Too many post updates. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<{ title?: unknown; body?: unknown }>(request);
    const post = await updateRiftboundPost(params.postId, userId, body.title, body.body);
    return NextResponse.json({ post });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { postId: string } }) {
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
}
