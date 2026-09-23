import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { loadOfficialAugmentRatings, voteOfficialAugment } from '@/lib/augment-official-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type Context = { params: { id: string } };

export const GET = withApiMetrics('/api/official-augments/[id]', async (request: Request, { params }: Context) => {
  try {
    const limited = await enforceApiRateLimit(request, {
      scope: 'official-augments:read',
      ip: { limit: 120, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json(
      { ratings: await loadOfficialAugmentRatings(params.id, await getOptionalAuthenticatedUserId(request)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/official-augments/[id]', async (request: Request, { params }: Context) => {
  try {
    const user = await getAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'official-augments:vote',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: user, limit: 30, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json({
      ratings: await voteOfficialAugment(params.id, user, await readJsonBody(request, 1000)),
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
