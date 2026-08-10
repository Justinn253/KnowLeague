import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getDailyDateKey } from '@/lib/game-storage';
import { getSkindleDailyStats, recordSkindleGuess } from '@/lib/skindle-stats';

export const runtime = 'nodejs';

function shouldIncludeTopGuesses(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get('includeTop') === 'true';
}

export const GET = withApiMetrics('/api/skindle/stats', async function GET(request: Request) {
  const dateKey = getDailyDateKey();
  const stats = await getSkindleDailyStats(dateKey, shouldIncludeTopGuesses(request));
  return NextResponse.json(stats, {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const POST = withApiMetrics('/api/skindle/stats', async function POST(request: Request) {
  const body = await request.json();

  if (
    !body ||
    typeof body.clientId !== 'string' ||
    typeof body.skinId !== 'string' ||
    typeof body.answer !== 'string' ||
    typeof body.isCorrect !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Invalid Skindle stats payload.' }, { status: 400 });
  }

  const result = await recordSkindleGuess(
    {
      dateKey: getDailyDateKey(),
      clientId: body.clientId,
      skinId: body.skinId,
      answer: body.answer,
      isCorrect: body.isCorrect,
    },
    body.isCorrect,
  );

  return NextResponse.json(result);
});
