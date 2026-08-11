import { withApiMetrics } from '@/lib/api-metrics';
import { getRiotAccountPopularSearches, type RiotAccountPopularityPeriod } from '@/lib/riot-account-viewer';
import { NextResponse } from 'next/server';

const periods: readonly RiotAccountPopularityPeriod[] = ['day', 'week', 'month', 'all_time'];
const limits = [10, 25, 50] as const;

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/riot-account/popular', async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedPeriod = url.searchParams.get('period') ?? 'day';
  const requestedLimit = Number(url.searchParams.get('limit') ?? '10');

  if (!periods.includes(requestedPeriod as RiotAccountPopularityPeriod)) {
    return NextResponse.json({ error: 'period is invalid.' }, { status: 400 });
  }

  const limit = limits.includes(requestedLimit as (typeof limits)[number]) ? requestedLimit : 10;
  const accounts = await getRiotAccountPopularSearches(requestedPeriod as RiotAccountPopularityPeriod, limit);
  if (accounts === null) {
    return NextResponse.json({ error: 'Popular account data is not configured yet. Apply the Riot account popularity migration first.' }, { status: 503 });
  }
  return NextResponse.json({ period: requestedPeriod, limit, accounts }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
});
