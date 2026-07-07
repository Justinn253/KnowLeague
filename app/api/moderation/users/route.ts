import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import {
  forceUserLogout,
  requireAdminAccess,
  requireModerationAccess,
  searchModerationUsers,
  sendModerationDirectMessage,
  setStoredModeratorRole,
  setUserBanState,
  type StoredAppRole,
} from '@/lib/moderation';

type RoleUpdateBody = {
  targetUserId: string;
  role: StoredAppRole;
};

type UserActionBody = {
  targetUserId: string;
  action: 'message' | 'logout' | 'ban' | 'unban';
  message?: string;
};

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const query = new URL(request.url).searchParams.get('q') ?? '';
    return NextResponse.json({ users: await searchModerationUsers(query, user.id) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireAdminAccess(user);
    const body = await readJsonBody<RoleUpdateBody>(request);
    const targetUserId = requireString(body.targetUserId, 'targetUserId');
    const role = body.role === 'moderator' ? 'moderator' : body.role === 'user' ? 'user' : null;
    if (!role) {
      throw new Error('role must be user or moderator.');
    }

    await setStoredModeratorRole(targetUserId, role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const body = await readJsonBody<UserActionBody>(request);
    const targetUserId = requireString(body.targetUserId, 'targetUserId');

    if (body.action === 'message') {
      const message = requireString(body.message, 'message');
      await sendModerationDirectMessage(user.id, targetUserId, message);
    } else if (body.action === 'logout') {
      await forceUserLogout(targetUserId);
    } else if (body.action === 'ban') {
      await setUserBanState(targetUserId, true);
    } else if (body.action === 'unban') {
      await setUserBanState(targetUserId, false);
    } else {
      throw new Error('Invalid moderation action.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
