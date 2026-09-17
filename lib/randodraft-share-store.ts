import { Redis } from '@upstash/redis';
import type { DraftHistoryInput } from '@/lib/randodraft-history';

export const RANDODRAFT_SHARE_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export type StoredRandodraftShare = {
  draft: DraftHistoryInput;
  completedAt: string;
};

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
const keyPrefix = 'knowleague:randodraft:share:';

export function randodraftShareStoreConfigured() {
  return Boolean(redis);
}

export async function saveRandodraftShare(id: string, share: StoredRandodraftShare) {
  if (!redis) return false;
  await redis.set(`${keyPrefix}${id}`, JSON.stringify(share), { ex: RANDODRAFT_SHARE_RETENTION_SECONDS, nx: true });
  return true;
}

export async function readRandodraftShare(id: string): Promise<StoredRandodraftShare | null> {
  if (!redis) return null;
  const raw = await redis.get<StoredRandodraftShare | string>(`${keyPrefix}${id}`);
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as StoredRandodraftShare : raw;
    if (!parsed || typeof parsed !== 'object' || !parsed.draft || typeof parsed.completedAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
