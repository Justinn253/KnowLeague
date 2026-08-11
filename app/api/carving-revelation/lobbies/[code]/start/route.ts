import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { startCarvingRevelationLobby } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type StartBody = { clientId: string };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/start', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<StartBody>(request);
    return NextResponse.json(await startCarvingRevelationLobby(params.code, requireString(body.clientId, 'clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
