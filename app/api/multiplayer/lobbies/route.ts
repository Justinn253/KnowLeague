import { NextResponse } from 'next/server';
import { createMultiplayerQuizLobby, parseMultiplayerQuizGameMode } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type CreateLobbyBody = { gameMode: string; clientId: string; record?: { wins?: number; losses?: number } };
export const runtime = 'nodejs';
const lobbyCreateRateLimit = getDualRateLimit('lobbyCreate');

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'multiplayer-lobby-create',
      ip: lobbyCreateRateLimit.ip,
      subject: { id: authUserId ?? clientId, ...lobbyCreateRateLimit.subject },
      errorMessage: 'Too many lobby creation attempts. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const view = await createMultiplayerQuizLobby({
      gameMode: parseMultiplayerQuizGameMode(body.gameMode),
      clientId,
      authUserId,
      recordSnapshot: body.record ? { wins: Number(body.record.wins), losses: Number(body.record.losses) } : null,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
