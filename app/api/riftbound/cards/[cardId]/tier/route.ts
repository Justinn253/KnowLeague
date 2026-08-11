import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { castRiftboundCardTierVote } from '@/lib/riftbound-card-tiers';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type VoteBody = {
  tier?: unknown;
};

export const POST = withApiMetrics('/api/riftbound/cards/[cardId]/tier', async function POST(request: Request, { params }: { params: { cardId: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:card-tier-vote',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 30, windowMs: 60_000 },
      errorMessage: 'Too many card tier votes. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<VoteBody>(request);
    const rating = await castRiftboundCardTierVote(userId, params.cardId, body.tier);
    return NextResponse.json({ rating });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
