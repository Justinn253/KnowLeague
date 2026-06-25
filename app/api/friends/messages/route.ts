import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getFriendMessages, markFriendMessagesRead, sendFriendMessage } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/rate-limit';

type MessageBody = {
  friendId: string;
  message: string;
};

export const runtime = 'nodejs';
const FRIEND_MESSAGE_RATE_LIMIT = {
  limit: 6,
  windowMs: 10 * 1000,
};

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const url = new URL(request.url);
    const friendId = requireString(url.searchParams.get('friendId'), 'friendId');
    const messages = await getFriendMessages(userId, friendId);
    if (url.searchParams.get('markRead') !== 'false') {
      await markFriendMessagesRead(userId, friendId);
    }
    return NextResponse.json(messages);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<MessageBody>(request);
    const friendId = requireString(body.friendId, 'friendId');
    const message = requireString(body.message, 'message');
    const rateLimit = checkRateLimit({
      key: `friend-message:${userId}`,
      limit: FRIEND_MESSAGE_RATE_LIMIT.limit,
      windowMs: FRIEND_MESSAGE_RATE_LIMIT.windowMs,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'You are sending messages too quickly. Please wait a few seconds and try again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    await sendFriendMessage(userId, friendId, message);
    const messages = await getFriendMessages(userId, friendId);
    return NextResponse.json(messages);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
