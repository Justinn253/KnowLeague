import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { loadRiftboundPost } from '@/lib/riftbound-community';
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
