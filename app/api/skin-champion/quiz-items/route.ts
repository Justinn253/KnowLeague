import { NextResponse, type NextRequest } from 'next/server';
import { getDailyQuizCacheControl } from '@/lib/cache-control';
import { dailySeed, seededShuffle } from '@/lib/daily-set';
import { getSkinCatalog } from '@/lib/catalogs';
import { shuffle } from '@/lib/quiz';
import type { SoloQuizDifficulty, SoloQuizMode } from '@/lib/solo-quiz';
import { getSkinThemeQuizItems } from '@/lib/skin-themes';

export const dynamic = 'force-dynamic';

const modes = new Set<SoloQuizMode>(['casual', 'daily', 'chaos']);
const difficulties = new Set<SoloQuizDifficulty>(['iron', 'gold', 'diamond', 'challenger']);

function getSoloSkinThemeItems(input: {
  mode: SoloQuizMode;
  difficulty: SoloQuizDifficulty;
  entryCount: number;
}) {
  const catalog = getSkinThemeQuizItems(getSkinCatalog());
  const count = Math.max(1, Math.min(100, Math.floor(input.entryCount)));

  if (input.mode === 'casual') {
    return shuffle(catalog).slice(0, count);
  }

  const seed = dailySeed(`skin-champion:${input.mode}:${input.difficulty}`);
  return seededShuffle(catalog, seed).slice(0, count);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') as SoloQuizMode | null;
  const difficulty = request.nextUrl.searchParams.get('difficulty') as SoloQuizDifficulty | null;
  const entryCount = Number(request.nextUrl.searchParams.get('entries') ?? 50);

  if (mode && modes.has(mode) && difficulty && difficulties.has(difficulty)) {
    return NextResponse.json(getSoloSkinThemeItems({
      mode,
      difficulty,
      entryCount: Number.isFinite(entryCount) ? entryCount : 50,
    }), {
      headers: { 'Cache-Control': mode === 'casual' ? 'no-store' : getDailyQuizCacheControl() },
    });
  }

  const catalog = getSkinThemeQuizItems(getSkinCatalog());

  return NextResponse.json(shuffle(catalog).slice(0, 50), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
