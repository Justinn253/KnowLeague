import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { updateMultiplayerQuizProgress, type MultiplayerQuizPlayerResult } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ProgressBody = {
  clientId: string;
  progress: number;
  elapsedSeconds: number;
  result?: MultiplayerQuizPlayerResult;
  record?: { wins?: number; losses?: number };
};
export const runtime = 'nodejs';
export const POST = withApiMetrics('/api/multiplayer/lobbies/[code]/progress', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ProgressBody>(request);
    return NextResponse.json(await updateMultiplayerQuizProgress(
      params.code,
      requireString(body.clientId, 'clientId'),
      Number(body.progress),
      Number(body.elapsedSeconds),
      body.result === 'completed' || body.result === 'failed' ? body.result : 'active',
      body.record ? { wins: Number(body.record.wins), losses: Number(body.record.losses) } : null,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
