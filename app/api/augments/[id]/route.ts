import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { deleteAugment, loadAugment, updateAugment, voteAugment } from '@/lib/augment-builder-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type Context = { params: { id: string } };
export const GET = withApiMetrics('/api/augments/[id]', async (request: Request, { params }: Context) => {
  try {
    const limited = await enforceApiRateLimit(request, {
      scope: 'augments:read',
      ip: { limit: 120, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json(
      { augment: await loadAugment(params.id, await getOptionalAuthenticatedUserId(request)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
export const PATCH = withApiMetrics('/api/augments/[id]', async (request: Request, { params }: Context) => {
  try {
    const user = await getAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'augments:edit',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: user, limit: 30, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json({ augment: await updateAugment(await readJsonBody(request, 40000), user, params.id) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
export const POST = withApiMetrics('/api/augments/[id]', async (request: Request, { params }: Context) => {
  try {
    const user = await getAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'augments:vote',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: user, limit: 30, windowMs: 60_000 },
    });
    if (limited) return limited;
    return NextResponse.json({ augment: await voteAugment(params.id, user, await readJsonBody(request, 1000)) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
export const DELETE = withApiMetrics('/api/augments/[id]', async (request: Request, { params }: Context) => {
  try {
    await deleteAugment(params.id, await getAuthenticatedUserId(request));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
