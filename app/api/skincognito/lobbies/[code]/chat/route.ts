import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { postSkincognitoChatMessage } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type ChatBody = {
  clientId: string;
  message: string;
};

export const runtime = 'nodejs';
const lobbyChatRateLimit = getDualRateLimit('lobbyChat');

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/chat', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ChatBody>(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'skincognito-lobby-chat',
      ip: lobbyChatRateLimit.ip,
      subject: { id: clientId, ...lobbyChatRateLimit.subject },
      errorMessage: 'You are sending chat messages too quickly. Please wait a few seconds and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const view = await postSkincognitoChatMessage(
      params.code,
      clientId,
      requireString(body.message, 'message'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
