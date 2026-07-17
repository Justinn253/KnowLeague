import { NextResponse } from 'next/server';
import { joinCarvingRevelationLobby } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type JoinLobbyBody = { code: string; clientId: string; requirePublic?: boolean };
export const runtime = 'nodejs';
const lobbyJoinRateLimit = getDualRateLimit('lobbyJoin');

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'carving-revelation-lobby-join',
      ip: lobbyJoinRateLimit.ip,
      subject: { id: authUserId ?? clientId, ...lobbyJoinRateLimit.subject },
      errorMessage: 'Too many lobby join attempts. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const view = await joinCarvingRevelationLobby(requireString(body.code, 'code'), {
      clientId,
      authUserId,
      requirePublic: body.requirePublic === true,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
