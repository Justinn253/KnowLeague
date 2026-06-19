import { NextResponse } from 'next/server';
import { createMultiplayerQuizLobby, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type CreateLobbyBody = { gameMode: string; clientId: string; displayName: string; authUserId?: string | null };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const view = await createMultiplayerQuizLobby({
      gameMode: parseMultiplayerQuizGameMode(body.gameMode),
      clientId: requireString(body.clientId, 'clientId'),
      displayName: requireString(body.displayName, 'displayName'),
      authUserId: typeof body.authUserId === 'string' ? body.authUserId : null,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
