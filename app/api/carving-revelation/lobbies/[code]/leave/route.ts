import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { leaveCarvingRevelationLobby } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type LeaveBody = { clientId: string; forfeit?: boolean };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/leave', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<LeaveBody>(request);
    return NextResponse.json(await leaveCarvingRevelationLobby(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.forfeit === true,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
