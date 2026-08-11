import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { listPublicMultiplayerQuizLobbies, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/multiplayer/lobbies/public', async function GET(request: Request) {
  try {
    const gameMode = new URL(request.url).searchParams.get('gameMode');
    return NextResponse.json(await listPublicMultiplayerQuizLobbies(parseMultiplayerQuizGameMode(gameMode)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
