import { getSkinCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';
import type { QuizItem } from '@/lib/quiz';

let cachedTarget: { dateKey: string; target: QuizItem | null } | null = null;

export function getDailySkindleTarget(now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  if (cachedTarget?.dateKey === dateKey) {
    return cachedTarget.target;
  }

  const [target] = seededShuffle(getSkinCatalog(), dailySeed('skindle', now));
  cachedTarget = { dateKey, target: target ?? null };
  return cachedTarget.target;
}
