import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getSecondsUntilNextUtcDay } from '@/lib/cache-control';
import { getDailySplashScrambleTarget } from '@/lib/splash-scramble-daily';

export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/splash-scramble/target', async function GET() {
  const now = new Date();
  const target = getDailySplashScrambleTarget(now);
  return NextResponse.json(target, {
    headers: {
      'Cache-Control': `private, max-age=${getSecondsUntilNextUtcDay(now)}`,
    },
  });
});
