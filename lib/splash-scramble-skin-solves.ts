import { getSkinCatalog } from '@/lib/catalogs';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

type SplashScrambleSkinSolveRow = {
  skin_key: string;
  solve_count: number;
};

const skinIds = new Set(getSkinCatalog().map((skin) => skin.id));

function normalizeSkinId(skinId: string) {
  const normalizedSkinId = skinId.trim();
  if (!normalizedSkinId || !skinIds.has(normalizedSkinId)) {
    throw new Error('Invalid Splash Scramble skin.');
  }

  return normalizedSkinId;
}

async function getSkinSolveRow(functionName: 'get_or_create_splash_scramble_skin_solve' | 'record_splash_scramble_skin_solve', skinId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .rpc(functionName, { p_skin_id: normalizeSkinId(skinId) })
    .returns<SplashScrambleSkinSolveRow[]>();

  if (error) {
    throw error;
  }

  const row = (data as SplashScrambleSkinSolveRow[] | null)?.[0];
  if (!row) {
    throw new Error('Unable to load Splash Scramble skin solves.');
  }

  return {
    skinKey: row.skin_key,
    solveCount: row.solve_count,
  };
}

export function getSplashScrambleSkinSolves(skinId: string) {
  return getSkinSolveRow('get_or_create_splash_scramble_skin_solve', skinId);
}

export function recordSplashScrambleSkinSolve(skinId: string) {
  return getSkinSolveRow('record_splash_scramble_skin_solve', skinId);
}
