import { NextResponse, type NextRequest } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import {
  getSplashScrambleDailyLeaderboard,
  recordSplashScrambleDailyLeaderboardEntry,
} from '@/lib/splash-scramble-leaderboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getOptionalAuthenticatedUserId(request);
    const snapshot = await getSplashScrambleDailyLeaderboard({ userId });
    return NextResponse.json(snapshot);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json() as { moves?: unknown; completionTimeSeconds?: unknown };
    if (!isNonNegativeFiniteNumber(body.moves) || !isNonNegativeFiniteNumber(body.completionTimeSeconds)) {
      throw new Error('Invalid Splash Scramble leaderboard submission.');
    }

    const result = await recordSplashScrambleDailyLeaderboardEntry({
      userId,
      moves: body.moves,
      completionTimeSeconds: body.completionTimeSeconds,
    });
    return NextResponse.json(result);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
