import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getDailyQuizCacheControl } from '@/lib/cache-control';
import { getAbilityCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';

export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/ddragon/quiz-items', async function GET() {
  const daily = seededShuffle(getAbilityCatalog(), dailySeed('ability-blitz')).slice(0, 50);
  return NextResponse.json(daily, {
    headers: { 'Cache-Control': getDailyQuizCacheControl() },
  });
});
