import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { recordRiftboundPostShare } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-share',
      ip: { limit: 30, windowMs: 60_000 },
      errorMessage: 'Too many share requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const shareCount = await recordRiftboundPostShare(params.postId);
    return NextResponse.json({ shareCount });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
