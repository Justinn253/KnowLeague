import { NextResponse } from 'next/server';
import { joinMultiplayerQuizLobby, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type JoinLobbyBody = { code: string; gameMode: string; clientId: string; authUserId?: string | null };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const view = await joinMultiplayerQuizLobby(requireString(body.code, 'code'), {
      gameMode: parseMultiplayerQuizGameMode(body.gameMode),
      clientId: requireString(body.clientId, 'clientId'),
      authUserId: typeof body.authUserId === 'string' ? body.authUserId : null,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
