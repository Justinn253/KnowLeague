import { NextResponse } from 'next/server';
import { getSecondsUntilNextUtcDay } from '@/lib/cache-control';
import { getDailySkindleTarget } from '@/lib/skindle-daily';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const target = getDailySkindleTarget(now);
  return NextResponse.json(target, {
    headers: {
      'Cache-Control': `private, max-age=${getSecondsUntilNextUtcDay(now)}`,
    },
  });
}
