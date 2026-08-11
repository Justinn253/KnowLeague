import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { heartbeatCarvingRevelationPlayer } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type HeartbeatBody = { clientId: string; connected?: boolean };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/heartbeat', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<HeartbeatBody>(request);
    return NextResponse.json(await heartbeatCarvingRevelationPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.connected !== false,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
