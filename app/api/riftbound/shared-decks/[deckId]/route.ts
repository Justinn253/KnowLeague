import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { loadRiftboundSharedDeck } from '@/lib/riftbound-shared-decks';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/riftbound/shared-decks/[deckId]', async function GET(request: Request, { params }: { params: { deckId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:shared-deck',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many shared deck requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewerId = await getOptionalAuthenticatedUserId(request);
    const deck = await loadRiftboundSharedDeck(params.deckId, viewerId);
    const response = NextResponse.json({ deck });
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
