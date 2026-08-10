import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { kickSkincognitoPlayer } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type KickBody = {
  clientId: string;
  targetPlayerId: string;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/kick', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<KickBody>(request);
    const view = await kickSkincognitoPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.targetPlayerId, 'targetPlayerId'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
