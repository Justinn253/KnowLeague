import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { loadOfficialAugmentRatingsBatch } from '@/lib/augment-official-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/official-augments', async (request: Request) => {
  try {
    const limited = await enforceApiRateLimit(request, {
      scope: 'official-augments:catalogue-read',
      ip: { limit: 60, windowMs: 60_000 },
    });
    if (limited) return limited;
    const ids = new URL(request.url).searchParams.get('ids')?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
    return NextResponse.json(
      { ratings: await loadOfficialAugmentRatingsBatch(ids, await getOptionalAuthenticatedUserId(request)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
