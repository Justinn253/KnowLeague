import { NextResponse } from 'next/server';
import { createSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type CreateLobbyBody = {
  clientId: string;
  selectedSkinId?: string | null;
};

export const runtime = 'nodejs';
const lobbyCreateRateLimit = getDualRateLimit('lobbyCreate');

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'skincognito-lobby-create',
      ip: lobbyCreateRateLimit.ip,
      subject: { id: authUserId ?? clientId, ...lobbyCreateRateLimit.subject },
      errorMessage: 'Too many lobby creation attempts. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const view = await createSkincognitoLobby({
      clientId,
      authUserId,
      selectedSkinId: typeof body.selectedSkinId === 'string' ? body.selectedSkinId : null,
    });

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
