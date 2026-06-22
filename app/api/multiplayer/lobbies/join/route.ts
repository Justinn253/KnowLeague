import { NextResponse } from 'next/server';
import { joinMultiplayerQuizLobby, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';

type JoinLobbyBody = { code: string; gameMode: string; clientId: string };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const view = await joinMultiplayerQuizLobby(requireString(body.code, 'code'), {
      gameMode: parseMultiplayerQuizGameMode(body.gameMode),
      clientId: requireString(body.clientId, 'clientId'),
      authUserId,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
