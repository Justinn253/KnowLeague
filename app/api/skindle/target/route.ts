import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getSecondsUntilNextUtcDay } from '@/lib/cache-control';
import { getDailySkindleTarget } from '@/lib/skindle-daily';

export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/skindle/target', async function GET() {
  const now = new Date();
  const target = getDailySkindleTarget(now);
  return NextResponse.json(target, {
    headers: {
      'Cache-Control': `private, max-age=${getSecondsUntilNextUtcDay(now)}`,
    },
  });
});
