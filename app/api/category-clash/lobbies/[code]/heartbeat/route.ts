import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { heartbeatCategoryClashPlayer } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type HeartbeatBody = { clientId: string; connected?: boolean };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/category-clash/lobbies/[code]/heartbeat', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<HeartbeatBody>(request);
    return NextResponse.json(await heartbeatCategoryClashPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.connected !== false,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
