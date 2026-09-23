import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { loadAugmentCommunity, publishAugment } from '@/lib/augment-builder-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const GET = withApiMetrics('/api/augments', async (request: Request) => {
  try {
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort') ?? 'newest';
    const query = url.searchParams.get('q') ?? '';
    const page = Number(url.searchParams.get('page') ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new ApiError(400, 'Invalid augment page.');
    if (query.length > 80) throw new ApiError(400, 'Search query is too long.');
    const limited = await enforceApiRateLimit(request, {
      scope: 'augments:community',
      ip: { limit: 60, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json(
      await loadAugmentCommunity(sort, query, page, await getOptionalAuthenticatedUserId(request)),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/augments', async (request: Request) => {
  try {
    const user = await getOptionalAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'augments:publish',
      ip: { limit: 10, windowMs: 60_000 },
      subject: { id: user, limit: 10, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json(
      { augment: await publishAugment(await readJsonBody(request, 40000), user) },
      { status: 201 },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
