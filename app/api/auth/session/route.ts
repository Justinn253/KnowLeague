import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/auth/session', async function GET(request: Request) {
  try {
    await getAuthenticatedUser(request);
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ error: 'Authentication is required.' }, { status: 401 });
  }
});
