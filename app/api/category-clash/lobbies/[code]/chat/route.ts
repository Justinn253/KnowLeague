import { NextResponse } from 'next/server';
import { postCategoryClashChatMessage } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type ChatBody = { clientId: string; message: string };
export const runtime = 'nodejs';
const lobbyChatRateLimit = getDualRateLimit('lobbyChat');

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ChatBody>(request);
    const clientId = requireString(body.clientId, 'clientId');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'category-clash-lobby-chat',
      ip: lobbyChatRateLimit.ip,
      subject: { id: clientId, ...lobbyChatRateLimit.subject },
      errorMessage: 'You are sending chat messages too quickly. Please wait a few seconds and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    return NextResponse.json(await postCategoryClashChatMessage(
      params.code,
      clientId,
      requireString(body.message, 'message'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
