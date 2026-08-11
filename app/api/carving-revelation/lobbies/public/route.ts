import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { listPublicCarvingRevelationLobbies } from '@/lib/carving-revelation';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/carving-revelation/lobbies/public', async function GET() {
  try {
    return NextResponse.json(await listPublicCarvingRevelationLobbies(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
