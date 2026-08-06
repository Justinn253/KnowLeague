import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { respondToFriendRequest } from '@/lib/friends';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { recordAchievementEvent } from '@/lib/achievements-server';

type RespondBody = {
  action: 'accept' | 'decline';
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<RespondBody>(request);
    const action = requireString(body.action, 'action');
    if (action !== 'accept' && action !== 'decline') {
      throw new Error('Invalid friend request action.');
    }

    await respondToFriendRequest(userId, params.id, action);
    if (action === 'accept') {
      try {
        await recordAchievementEvent(userId, 'friend_added');
      } catch {
        // Achievement persistence should not make a successful acceptance fail.
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
