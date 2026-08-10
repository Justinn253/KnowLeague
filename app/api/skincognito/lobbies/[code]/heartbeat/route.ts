import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { heartbeatSkincognitoPlayer } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type HeartbeatBody = {
  clientId: string;
  connected?: boolean;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/heartbeat', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<HeartbeatBody>(request);
    const view = await heartbeatSkincognitoPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.connected !== false,
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
