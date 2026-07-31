import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { recordRiftboundSharedDeckShare } from '@/lib/riftbound-shared-decks';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { deckId: string } }) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:shared-deck-share',
      ip: { limit: 30, windowMs: 60_000 },
      errorMessage: 'Too many share requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const shareCount = await recordRiftboundSharedDeckShare(params.deckId);
    return NextResponse.json({ shareCount });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
