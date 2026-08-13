import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { createRiftboundShare } from '@/lib/riftbound-shares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateShareBody = {
  snapshot?: unknown;
};

export const POST = withApiMetrics('/api/riftbound/shares', async function POST(request: Request) {
  try {
    const ownerId = await getOptionalAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:share-create',
      ip: { limit: 20, windowMs: 60_000 },
      subject: { id: ownerId, limit: 120, windowMs: 60 * 60_000 },
      errorMessage: 'Too many Riftbound shares were created. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readJsonBody<CreateShareBody>(request);
    const result = await createRiftboundShare({ ownerId, snapshot: body.snapshot });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
