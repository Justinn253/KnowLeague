import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getFriendMessages, markFriendMessagesRead, sendFriendMessage } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type MessageBody = {
  friendId: string;
  message: string;
};

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const url = new URL(request.url);
    const friendId = requireString(url.searchParams.get('friendId'), 'friendId');
    const messages = await getFriendMessages(userId, friendId);
    await markFriendMessagesRead(userId, friendId);
    return NextResponse.json(messages);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<MessageBody>(request);
    await sendFriendMessage(
      userId,
      requireString(body.friendId, 'friendId'),
      requireString(body.message, 'message'),
    );
    const messages = await getFriendMessages(userId, requireString(body.friendId, 'friendId'));
    return NextResponse.json(messages);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
