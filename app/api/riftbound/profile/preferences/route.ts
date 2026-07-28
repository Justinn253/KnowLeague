import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { loadRiftboundCardPreferences } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:profile-preferences-read',
      ip: { limit: 120, windowMs: 60_000 },
      subject: { id: userId, limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many Riftbound preference requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const response = NextResponse.json(await loadRiftboundCardPreferences(userId));
    response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
