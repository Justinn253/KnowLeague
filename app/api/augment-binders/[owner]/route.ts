import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { ApiError, getRouteErrorResponse } from '@/lib/api-utils';
import { loadAugmentBinder } from '@/lib/augment-builder-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const GET = withApiMetrics(
  '/api/augment-binders/[owner]',
  async (request: Request, { params }: { params: { owner: string } }) => {
    try {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 0);
      if (!Number.isInteger(page) || page < 0 || page > 10000) throw new ApiError(400, 'Invalid binder page.');
      const limited = await enforceApiRateLimit(request, {
        scope: 'augments:binder',
        ip: { limit: 60, windowMs: 60_000 },
      });
      if (limited) return limited;
      return NextResponse.json(
        await loadAugmentBinder(params.owner, page, await getOptionalAuthenticatedUserId(request)),
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      return getRouteErrorResponse(error);
    }
  },
);
