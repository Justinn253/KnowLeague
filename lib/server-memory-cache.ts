type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function cleanupExpiredCache(now: number) {
  if (cache.size < 500) return;
  cache.forEach((entry, key) => {
    if (entry.expiresAt <= now) cache.delete(key);
  });
}

export function getServerCache<T>(key: string) {
  const now = Date.now();
  cleanupExpiredCache(now);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setServerCache<T>(key: string, value: T, ttlMs: number) {
  if (ttlMs <= 0) return;
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function deleteServerCache(key: string) {
  cache.delete(key);
}
