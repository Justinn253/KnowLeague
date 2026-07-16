import { NextResponse } from 'next/server';
import { getDailySkindleTarget } from '@/lib/skindle-daily';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const target = getDailySkindleTarget(now);
  const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const maxAge = Math.max(0, Math.floor((nextReset - now.getTime()) / 1000));
  return NextResponse.json(target, {
    headers: {
      'Cache-Control': `private, max-age=${maxAge}`,
    },
  });
}
