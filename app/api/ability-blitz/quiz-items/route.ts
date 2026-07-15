import { NextResponse, type NextRequest } from 'next/server';
import { getAbilityCatalog } from '@/lib/catalogs';
import { shuffle } from '@/lib/quiz';
import { getSoloQuizItems, type SoloQuizDifficulty, type SoloQuizMode } from '@/lib/solo-quiz';

export const dynamic = 'force-dynamic';

const modes = new Set<SoloQuizMode>(['casual', 'daily', 'chaos']);
const difficulties = new Set<SoloQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);

function getQuizItemsCacheControl(mode: SoloQuizMode) {
  if (mode === 'casual') return 'no-store';
  const now = new Date();
  const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return `public, max-age=${Math.max(0, Math.floor((nextReset - now.getTime()) / 1000))}`;
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') as SoloQuizMode | null;
  const difficulty = request.nextUrl.searchParams.get('difficulty') as SoloQuizDifficulty | null;
  const entryCount = Number(request.nextUrl.searchParams.get('entries') ?? 100);

  if (mode && modes.has(mode) && difficulty && difficulties.has(difficulty)) {
    return NextResponse.json(getSoloQuizItems({
      gameId: 'ability-blitz',
      mode,
      difficulty,
      entryCount: Number.isFinite(entryCount) ? entryCount : 100,
    }), {
      headers: { 'Cache-Control': getQuizItemsCacheControl(mode) },
    });
  }

  return NextResponse.json(shuffle(getAbilityCatalog()), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
