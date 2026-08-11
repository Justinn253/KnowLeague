import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { kickMultiplayerQuizPlayer } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type KickBody = { clientId: string; targetPlayerId: string };
export const runtime = 'nodejs';
export const POST = withApiMetrics('/api/multiplayer/lobbies/[code]/kick', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<KickBody>(request);
    return NextResponse.json(await kickMultiplayerQuizPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.targetPlayerId, 'targetPlayerId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
