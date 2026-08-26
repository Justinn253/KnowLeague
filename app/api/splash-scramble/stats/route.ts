import { withApiMetrics } from '@/lib/api-metrics';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { NextResponse } from 'next/server';
import { getDailyDateKey } from '@/lib/game-storage';
import { getSplashScrambleDailyStats, recordSplashScrambleSolve } from '@/lib/splash-scramble-stats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/splash-scramble/stats', async function GET() {
  const dateKey = getDailyDateKey();
  const stats = await getSplashScrambleDailyStats(dateKey);
  return NextResponse.json(stats);
});

export const POST = withApiMetrics('/api/splash-scramble/stats', async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ clientId?: unknown }>(request);

    if (
      typeof body.clientId !== 'string'
      || body.clientId.trim().length === 0
      || body.clientId.length > 128
    ) {
      return NextResponse.json({ error: 'Invalid Splash Scramble stats payload.' }, { status: 400 });
    }

    const result = await recordSplashScrambleSolve({
      dateKey: getDailyDateKey(),
      clientId: body.clientId,
    });

    return NextResponse.json({
      ...result.snapshot,
      accepted: result.accepted,
      clientAlreadySolved: result.clientAlreadySolved,
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
