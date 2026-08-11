import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { createCategoryClashLobby } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type CreateLobbyBody = { clientId: string };
export const runtime = 'nodejs';
const lobbyCreateRateLimit = getDualRateLimit('lobbyCreate');

export const POST = withApiMetrics('/api/category-clash/lobbies', async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'category-clash-lobby-create',
      ip: lobbyCreateRateLimit.ip,
      subject: { id: authUserId ?? clientId, ...lobbyCreateRateLimit.subject },
      errorMessage: 'Too many lobby creation attempts. Please wait a minute and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const view = await createCategoryClashLobby({
      clientId,
      authUserId,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
