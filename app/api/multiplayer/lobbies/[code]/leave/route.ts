import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { leaveMultiplayerQuizLobby } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type LeaveBody = { clientId: string; forfeit?: boolean };
export const runtime = 'nodejs';
export const POST = withApiMetrics('/api/multiplayer/lobbies/[code]/leave', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<LeaveBody>(request);
    return NextResponse.json(await leaveMultiplayerQuizLobby(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.forfeit === true,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
