import { getSkinCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';
import { getDailySkindleTarget } from '@/lib/skindle-daily';
import type { QuizItem } from '@/lib/quiz';

let cachedTarget: { dateKey: string; target: QuizItem | null } | null = null;

export function getDailySplashScrambleTarget(now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  if (cachedTarget?.dateKey === dateKey) {
    return cachedTarget.target;
  }

  const skindleTargetId = getDailySkindleTarget(now)?.id;
  const target = seededShuffle(getSkinCatalog(), dailySeed('splash-scramble', now))
    .find((skin) => skin.id !== skindleTargetId) ?? null;
  cachedTarget = { dateKey, target };
  return target;
}
