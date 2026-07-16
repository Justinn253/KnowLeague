import { NextResponse } from 'next/server';
import { getDailyDateKey } from '@/lib/game-storage';
import { getSplashScrambleDailyStats, recordSplashScrambleSolve } from '@/lib/splash-scramble-stats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const dateKey = getDailyDateKey();
  const stats = await getSplashScrambleDailyStats(dateKey);
  return NextResponse.json(stats);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body || typeof body.clientId !== 'string' || body.clientId.trim().length === 0) {
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
}
