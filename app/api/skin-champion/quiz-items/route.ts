import { NextResponse, type NextRequest } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';
import { shuffle } from '@/lib/quiz';
import { getSoloQuizItems, type SoloQuizDifficulty, type SoloQuizMode } from '@/lib/solo-quiz';

export const dynamic = 'force-dynamic';

const modes = new Set<SoloQuizMode>(['casual', 'daily', 'chaos']);
const difficulties = new Set<SoloQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') as SoloQuizMode | null;
  const difficulty = request.nextUrl.searchParams.get('difficulty') as SoloQuizDifficulty | null;
  const entryCount = Number(request.nextUrl.searchParams.get('entries') ?? 50);

  if (mode && modes.has(mode) && difficulty && difficulties.has(difficulty)) {
    return NextResponse.json(getSoloQuizItems({
      gameId: 'skin-champion',
      mode,
      difficulty,
      entryCount: Number.isFinite(entryCount) ? entryCount : 50,
    }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json(shuffle(getSkinCatalog()).slice(0, 50), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
