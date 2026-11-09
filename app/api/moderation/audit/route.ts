import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getRouteErrorResponse, PRIVATE_NO_STORE_HEADERS } from '@/lib/api-utils';
import { listStaffAuditLogs, requireModerationAccess } from '@/lib/moderation';

export const runtime = 'nodejs';

function getBoundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid pagination value.');
  }
  return parsed;
}

export const GET = withApiMetrics('/api/moderation/audit', async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    await requireModerationAccess(user);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(
      await listStaffAuditLogs(
        getBoundedInteger(params.get('offset'), 0, 0, 5_000),
        getBoundedInteger(params.get('limit'), 50, 1, 50),
      ),
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
