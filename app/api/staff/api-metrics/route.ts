import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { getApiMetricSummary, withApiMetrics } from '@/lib/api-metrics';

export const runtime = 'nodejs';

const privateJsonHeaders = { 'Cache-Control': 'private, no-store' };
const staffJson = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: privateJsonHeaders,
});

export const GET = withApiMetrics('/api/staff/api-metrics', async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const role = await getAuthenticatedAppRole(user);
    if (!canAccessModeration(role)) {
      return staffJson({ error: 'Staff access is required.' }, 403);
    }

    const requestedHours = Number(new URL(request.url).searchParams.get('hours') ?? '24');
    return staffJson(await getApiMetricSummary(Number.isFinite(requestedHours) ? requestedHours : 24));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authentication is required.') {
      return staffJson({ error: 'Authentication is required.' }, 401);
    }
    return staffJson({ error: 'Unable to load API metrics.' }, 500);
  }
});
