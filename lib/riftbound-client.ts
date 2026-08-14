'use client';

import type { Session } from '@supabase/supabase-js';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';
import type { RiftboundCardTierRating } from '@/lib/riftbound';
import type { RiftboundInventoryItem } from '@/lib/riftbound-inventory';
import type { RiftboundBinder } from '@/lib/riftbound-binders';

export type { RiftboundInventoryItem } from '@/lib/riftbound-inventory';

export type RiftboundLatestPrice = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

export type RiftboundDeckCard = {
  card_id: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

export type RiftboundDeck = {
  id: string;
  name: string;
  description: string;
  legend_card_id: string;
  chosen_champion_card_id: string;
  created_at: string;
  updated_at: string;
  cards: RiftboundDeckCard[];
};

export type RiftboundLatestPricesResponse = {
  prices?: Record<string, RiftboundLatestPrice>;
  snapshotDate?: string | null;
  sourceSnapshotAt?: string | null;
  capturedAt?: string | null;
  cardTiers?: Record<string, RiftboundCardTierRating>;
  error?: string;
};

export type RiftboundPriceHistoryEntry = {
  date: string;
  finish: 'normal' | 'foil';
  price: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  granularity?: 'month';
};

type RiftboundPriceHistoryResponse = {
  history?: RiftboundPriceHistoryEntry[];
  error?: string;
};

export type RiftboundBootstrapResponse = RiftboundLatestPricesResponse & {
  inventory?: { items?: RiftboundInventoryItem[] };
  binders?: { binders?: RiftboundBinder[]; limit?: number };
  decks?: { decks?: RiftboundDeck[] };
};

type CachedResponse<T> = {
  expiresAt: number;
  value: T;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const RIFTBOUND_PRICE_HISTORY_CACHE_VERSION = 'v4';
const RIFTBOUND_LATEST_PRICES_CACHE_VERSION = 'v2';
const responseCache = new Map<string, CachedResponse<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const cacheGenerations = new Map<string, number>();

function getCacheGeneration(key: string) {
  return cacheGenerations.get(key) ?? 0;
}

async function requestRiftboundData<T>(
  key: string,
  url: string,
  session?: Session | null,
  requestInit: { cache?: RequestCache } = {},
): Promise<T> {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const existingRequest = inFlightRequests.get(key);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const requestGeneration = getCacheGeneration(key);

  const headers: HeadersInit = session
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
  const request = fetch(url, { cache: requestInit.cache ?? 'no-store', headers })
    .then(async (response) => {
      const data = await response.json() as T & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load Riftbound data.');
      if (getCacheGeneration(key) === requestGeneration) {
        responseCache.set(key, { expiresAt: Date.now() + REQUEST_CACHE_TTL_MS, value: data });
      }
      return data;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key);
      }
    });

  inFlightRequests.set(key, request);
  return request;
}

export function getRiftboundBootstrap(session: Session | null) {
  // Access tokens rotate during a normal session. The response is already
  // scoped by user on the server, so keying by token would defeat request
  // deduplication and retain one cache entry for every token refresh.
  const key = session ? `bootstrap:${session.user.id}` : 'bootstrap:guest';
  return requestRiftboundData<RiftboundBootstrapResponse>(key, '/api/riftbound/bootstrap', session);
}

export function invalidateRiftboundBootstrap(session: Session | null) {
  const key = session ? `bootstrap:${session.user.id}` : 'bootstrap:guest';
  cacheGenerations.set(key, getCacheGeneration(key) + 1);
  responseCache.delete(key);
}

export function invalidateRiftboundLatestPrices(session?: Session | null) {
  const key = `latest-prices:${RIFTBOUND_LATEST_PRICES_CACHE_VERSION}:${session?.user.id ?? 'guest'}`;
  cacheGenerations.set(key, getCacheGeneration(key) + 1);
  responseCache.delete(key);
}

export function getRiftboundLatestPrices(session?: Session | null) {
  const key = `latest-prices:${RIFTBOUND_LATEST_PRICES_CACHE_VERSION}:${session?.user.id ?? 'guest'}`;
  return requestRiftboundData<RiftboundLatestPricesResponse>(key, `/api/riftbound/prices/latest?version=${RIFTBOUND_LATEST_PRICES_CACHE_VERSION}`, session, { cache: 'no-store' });
}

export function getRiftboundCardPriceHistory(cardId: string, days = 30) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  return requestRiftboundData<RiftboundPriceHistoryResponse>(
    `card-history:${RIFTBOUND_PRICE_HISTORY_CACHE_VERSION}:${cardId}:${safeDays}`,
    `/api/riftbound/prices/${encodeURIComponent(cardId)}?days=${safeDays}&historyVersion=${RIFTBOUND_PRICE_HISTORY_CACHE_VERSION}`,
    null,
    { cache: 'force-cache' },
  ).then((data) => data.history ?? []);
}
