import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { listPublicSkincognitoLobbies } from '@/lib/skincognito';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/skincognito/lobbies/public', async function GET() {
  try {
    return NextResponse.json(await listPublicSkincognitoLobbies(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
