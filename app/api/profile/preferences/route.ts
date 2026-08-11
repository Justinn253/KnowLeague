import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { updateProfileSettings } from '@/lib/profile-settings';

export const runtime = 'nodejs';

type ProfilePreferencesBody = {
  profileStatus?: unknown;
  friendsListPublic?: unknown;
};

export const PUT = withApiMetrics('/api/profile/preferences', async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await readJsonBody<ProfilePreferencesBody>(request);
    const updates: { profileStatus?: string; friendsListPublic?: boolean } = {};

    if (body.profileStatus !== undefined) {
      if (typeof body.profileStatus !== 'string') {
        throw new Error('Profile status must be text.');
      }
      if (body.profileStatus.trim().length > 50) {
        throw new Error('Profile status must be 50 characters or fewer.');
      }
      updates.profileStatus = body.profileStatus;
    }

    if (body.friendsListPublic !== undefined) {
      if (typeof body.friendsListPublic !== 'boolean') {
        throw new Error('Friends-list visibility must be a boolean.');
      }
      updates.friendsListPublic = body.friendsListPublic;
    }

    const settings = await updateProfileSettings(user.id, updates);
    return NextResponse.json({ settings });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
