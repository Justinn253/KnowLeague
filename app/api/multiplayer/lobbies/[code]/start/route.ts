import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { startMultiplayerQuizLobby } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type StartBody = { clientId: string; record?: { wins?: number; losses?: number } };
export const runtime = 'nodejs';
export const POST = withApiMetrics('/api/multiplayer/lobbies/[code]/start', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<StartBody>(request);
    return NextResponse.json(await startMultiplayerQuizLobby(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.record ? { wins: Number(body.record.wins), losses: Number(body.record.losses) } : null,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
