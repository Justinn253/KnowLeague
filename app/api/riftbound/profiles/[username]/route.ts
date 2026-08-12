import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { loadRiftboundProfile } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/profiles/[username]', async function GET(request: Request, { params }: { params: { username: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound-profile',
      ip: { limit: 60, windowMs: 60_000 },
      errorMessage: 'Too many Riftbound profile requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewer = await getOptionalAuthenticatedUser(request);
    const viewerId = viewer?.id ?? null;
    const isStaff = viewer ? canAccessModeration(await getAuthenticatedAppRole(viewer)) : false;
    const profile = await loadRiftboundProfile(params.username, viewerId, isStaff);
    const response = NextResponse.json({ profile });
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
