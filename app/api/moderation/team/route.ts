import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { listModerationTeamMembers, requireModerationAccess } from '@/lib/moderation';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/moderation/team', async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    return NextResponse.json({ team: await listModerationTeamMembers() });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
