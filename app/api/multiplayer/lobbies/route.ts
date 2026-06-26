import { NextResponse } from 'next/server';
import { createMultiplayerQuizLobby, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';

type CreateLobbyBody = { gameMode: string; clientId: string; record?: { wins?: number; losses?: number } };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const view = await createMultiplayerQuizLobby({
      gameMode: parseMultiplayerQuizGameMode(body.gameMode),
      clientId: requireString(body.clientId, 'clientId'),
      authUserId,
      recordSnapshot: body.record ? { wins: Number(body.record.wins), losses: Number(body.record.losses) } : null,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
