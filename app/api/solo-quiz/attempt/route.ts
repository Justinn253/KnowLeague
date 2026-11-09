import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  CHAOS_DIFFICULTY,
  finishSoloQuizAttempt,
  startSoloQuizAttempt,
  type SoloQuizDifficulty,
  type SoloQuizGameId,
  type SoloQuizMode,
} from '@/lib/solo-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const games = new Set<SoloQuizGameId>(['ability-blitz', 'skin-champion']);
const modes = new Set<SoloQuizMode>(['daily', 'chaos']);
const difficulties = new Set<SoloQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);
const SOLO_QUIZ_ATTEMPT_MAX_BODY_BYTES = 32 * 1024;
const SOLO_QUIZ_MAX_ITEM_IDS = 100;

function assertScope(body: { gameId?: SoloQuizGameId; mode?: SoloQuizMode; difficulty?: SoloQuizDifficulty }) {
  if (!body.gameId || !games.has(body.gameId) || !body.mode || !modes.has(body.mode) || !body.difficulty || !difficulties.has(body.difficulty)) {
    throw new Error('Invalid solo quiz attempt.');
  }

  return {
    gameId: body.gameId,
    mode: body.mode,
    difficulty: body.mode === 'chaos' ? CHAOS_DIFFICULTY : body.difficulty,
  };
}

export const POST = withApiMetrics('/api/solo-quiz/attempt', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<{
      action?: 'start' | 'finish';
      gameId?: SoloQuizGameId;
      mode?: SoloQuizMode;
      difficulty?: SoloQuizDifficulty;
      itemIds?: string[];
      completedItems?: number;
      elapsedSeconds?: number;
      wrongGuesses?: number;
      result?: 'completed' | 'failed' | 'abandoned';
    }>(request, SOLO_QUIZ_ATTEMPT_MAX_BODY_BYTES);
    const scope = assertScope(body);

    if (body.action === 'start') {
      const result = await startSoloQuizAttempt({ userId, ...scope });
      return NextResponse.json(result);
    }

    if (body.action === 'finish') {
      await finishSoloQuizAttempt({
        userId,
        ...scope,
        itemIds: Array.isArray(body.itemIds)
          ? body.itemIds.filter((itemId): itemId is string => typeof itemId === 'string' && itemId.length <= 160).slice(0, SOLO_QUIZ_MAX_ITEM_IDS)
          : [],
        completedItems: Number(body.completedItems),
        elapsedSeconds: Number(body.elapsedSeconds),
        wrongGuesses: Number(body.wrongGuesses),
        result: body.result ?? 'abandoned',
      });
      return NextResponse.json({ recorded: true });
    }

    throw new Error('Invalid solo quiz attempt action.');
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
