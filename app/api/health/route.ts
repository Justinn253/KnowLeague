import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = {
  'Cache-Control': 'no-store, max-age=0',
};

export const GET = withApiMetrics('/api/health', async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'knowleague',
    },
    { headers: noStoreHeaders },
  );
});
