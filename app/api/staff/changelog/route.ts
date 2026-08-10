import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { STAFF_CHANGELOG_ENTRIES } from '@/lib/staff-changelog';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const role = await getAuthenticatedAppRole(user);
    if (!canAccessModeration(role)) {
      return NextResponse.json({ error: 'Staff access is required.' }, { status: 403 });
    }

    return NextResponse.json({ entries: STAFF_CHANGELOG_ENTRIES });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication is required.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
