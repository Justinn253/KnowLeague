import { NextResponse, type NextRequest } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import {
  CHAOS_DIFFICULTY,
  getSoloLeaderboard,
  recordSoloLeaderboardEntry,
  type SoloQuizDifficulty,
  type SoloQuizGameId,
  type SoloQuizMode,
} from '@/lib/solo-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const games = new Set<SoloQuizGameId>(['ability-blitz', 'skin-champion']);
const modes = new Set<SoloQuizMode>(['daily', 'chaos']);
const difficulties = new Set<SoloQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);

function parseScope(request: NextRequest) {
  const gameId = request.nextUrl.searchParams.get('gameId') as SoloQuizGameId | null;
  const mode = request.nextUrl.searchParams.get('mode') as SoloQuizMode | null;
  const difficulty = request.nextUrl.searchParams.get('difficulty') as SoloQuizDifficulty | null;

  if (!gameId || !games.has(gameId) || !mode || !modes.has(mode) || !difficulty || !difficulties.has(difficulty)) {
    throw new Error('Invalid leaderboard scope.');
  }

  return { gameId, mode, difficulty };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getOptionalAuthenticatedUserId(request);
    const scope = parseScope(request);
    const snapshot = await getSoloLeaderboard({
      ...scope,
      difficulty: scope.mode === 'chaos' ? CHAOS_DIFFICULTY : scope.difficulty,
      userId,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await request.json() as {
      gameId?: SoloQuizGameId;
      mode?: SoloQuizMode;
      difficulty?: SoloQuizDifficulty;
      itemIds?: string[];
      completionTimeSeconds?: number;
      wrongGuesses?: number;
    };

    if (
      !body.gameId ||
      !games.has(body.gameId) ||
      !body.mode ||
      !modes.has(body.mode) ||
      !body.difficulty ||
      !difficulties.has(body.difficulty) ||
      !Array.isArray(body.itemIds) ||
      body.itemIds.length === 0
    ) {
      throw new Error('Invalid leaderboard submission.');
    }

    const entry = await recordSoloLeaderboardEntry({
      userId,
      gameId: body.gameId,
      mode: body.mode,
      difficulty: body.mode === 'chaos' ? CHAOS_DIFFICULTY : body.difficulty,
      itemIds: body.itemIds,
      completionTimeSeconds: Number(body.completionTimeSeconds),
      wrongGuesses: Number(body.wrongGuesses),
    });

    return NextResponse.json({ recorded: Boolean(entry) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
