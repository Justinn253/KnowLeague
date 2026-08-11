import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getFriendMessages, sendFriendMessage } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getDualRateLimit } from '@/lib/abuse-controls';
import { enforceApiRateLimit } from '@/lib/rate-limit';

type MessageBody = {
  friendId: string;
  message: string;
};

export const runtime = 'nodejs';
const friendMessageRateLimit = getDualRateLimit('friendMessage');

export const GET = withApiMetrics('/api/friends/messages', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const url = new URL(request.url);
    const friendId = requireString(url.searchParams.get('friendId'), 'friendId');
    const messages = await getFriendMessages(userId, friendId, {
      markRead: url.searchParams.get('markRead') !== 'false',
    });
    return NextResponse.json(messages);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/friends/messages', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<MessageBody>(request);
    const friendId = requireString(body.friendId, 'friendId');
    const message = requireString(body.message, 'message');
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'friend-message',
      ip: friendMessageRateLimit.ip,
      subject: { id: userId, ...friendMessageRateLimit.subject },
      errorMessage: 'You are sending messages too quickly. Please wait a few seconds and try again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const sentMessage = await sendFriendMessage(userId, friendId, message);
    return NextResponse.json({ message: sentMessage });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
