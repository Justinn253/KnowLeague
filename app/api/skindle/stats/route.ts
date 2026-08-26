import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getDailyDateKey } from '@/lib/game-storage';
import { getSkindleDailyStats, recordSkindleGuess } from '@/lib/skindle-stats';

export const runtime = 'nodejs';

const MAX_GUESSES_PER_REQUEST = 100;

type SkindleGuessPayload = {
  skinId: string;
  answer: string;
  isCorrect: boolean;
};

function isValidSkindleGuess(value: unknown): value is SkindleGuessPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const guess = value as { skinId?: unknown; answer?: unknown; isCorrect?: unknown };
  return (
    typeof guess.skinId === 'string' &&
    typeof guess.answer === 'string' &&
    typeof guess.isCorrect === 'boolean' &&
    guess.skinId.trim().length > 0 &&
    guess.skinId.length <= 128 &&
    guess.answer.trim().length > 0 &&
    guess.answer.length <= 240
  );
}

function shouldIncludeTopGuesses(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get('includeTop') === 'true';
}

function getSkindleStatsErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('get_skindle_daily_stats') || message.includes('record_skindle_guess') || message.includes('skindle_daily_')) {
    return NextResponse.json(
      { error: 'Skindle global stats storage is not available. Apply the latest Supabase migrations.' },
      { status: 503 },
    );
  }

  return getRouteErrorResponse(error);
}

export const GET = withApiMetrics('/api/skindle/stats', async function GET(request: Request) {
  try {
    const dateKey = getDailyDateKey();
    const stats = await getSkindleDailyStats(dateKey, shouldIncludeTopGuesses(request));
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return getSkindleStatsErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/skindle/stats', async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof body.clientId !== 'string' ||
      body.clientId.trim().length === 0 ||
      body.clientId.length > 128
    ) {
      return NextResponse.json({ error: 'Invalid Skindle stats payload.' }, { status: 400 });
    }

    const guesses: unknown[] | null = Array.isArray(body.guesses)
      ? body.guesses
      : typeof body.skinId === 'string' && typeof body.answer === 'string' && typeof body.isCorrect === 'boolean'
        ? [{ skinId: body.skinId, answer: body.answer, isCorrect: body.isCorrect }]
        : null;

    if (
      !guesses ||
      guesses.length === 0 ||
      guesses.length > MAX_GUESSES_PER_REQUEST ||
      guesses.some((guess) => !isValidSkindleGuess(guess))
    ) {
      return NextResponse.json({ error: 'Invalid Skindle stats payload.' }, { status: 400 });
    }

    const dateKey = getDailyDateKey();
    const recordedGuesses = [];
    for (const guess of guesses as SkindleGuessPayload[]) {
      recordedGuesses.push({
        guess,
        result: await recordSkindleGuess({
          dateKey,
          clientId: body.clientId,
          skinId: guess.skinId,
          answer: guess.answer,
          isCorrect: guess.isCorrect,
        }),
      });
    }

    const lastRecordedGuess = recordedGuesses[recordedGuesses.length - 1];
    const firstForSkinIds = Array.from(
      new Set(
        recordedGuesses
          .filter(({ result }) => result.firstForSkin)
          .map(({ guess }) => guess.skinId),
      ),
    );

    return NextResponse.json({
      snapshot: lastRecordedGuess.result.snapshot,
      accepted: recordedGuesses.some(({ result }) => result.accepted),
      acceptedCount: recordedGuesses.filter(({ result }) => result.accepted).length,
      firstForSkinIds,
      clientAlreadySolved: recordedGuesses.some(({ result }) => result.clientAlreadySolved),
    });
  } catch (error) {
    return getSkindleStatsErrorResponse(error);
  }
});
