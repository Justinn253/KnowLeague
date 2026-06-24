import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { createFriendRequest, createFriendRequestByUsername } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type FriendRequestBody = {
  targetUserId?: string;
  targetUsername?: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<FriendRequestBody>(request);
    const status = body.targetUsername
      ? await createFriendRequestByUsername(userId, requireString(body.targetUsername, 'targetUsername'))
      : await createFriendRequest(userId, requireString(body.targetUserId, 'targetUserId'));
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
