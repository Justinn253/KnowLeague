'use client';

import type { Session } from '@supabase/supabase-js';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';

export type RiftboundLatestPrice = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

export type RiftboundInventoryItem = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

export type RiftboundSetCard = {
  card_id: string;
  quantity: number;
};

export type RiftboundSet = {
  id: string;
  name: string;
  created_at: string;
  cards: RiftboundSetCard[];
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
  error?: string;
};

export type RiftboundBootstrapResponse = RiftboundLatestPricesResponse & {
  inventory?: { items?: RiftboundInventoryItem[] };
  sets?: { sets?: RiftboundSet[] };
  decks?: { decks?: RiftboundDeck[] };
};

type CachedResponse<T> = {
  expiresAt: number;
  value: T;
};

const REQUEST_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, CachedResponse<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

async function requestRiftboundData<T>(
  key: string,
  url: string,
  session?: Session | null,
): Promise<T> {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const existingRequest = inFlightRequests.get(key);
  if (existingRequest) {
    return existingRequest as Promise<T>;
  }

  const headers: HeadersInit = session
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
  const request = fetch(url, { cache: 'no-store', headers })
    .then(async (response) => {
      const data = await response.json() as T & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load Riftbound data.');
      responseCache.set(key, { expiresAt: Date.now() + REQUEST_CACHE_TTL_MS, value: data });
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
  const key = session ? `bootstrap:${session.user.id}:${session.access_token}` : 'bootstrap:guest';
  return requestRiftboundData<RiftboundBootstrapResponse>(key, '/api/riftbound/bootstrap', session);
}

export function invalidateRiftboundBootstrap(session: Session | null) {
  const key = session ? `bootstrap:${session.user.id}:${session.access_token}` : 'bootstrap:guest';
  responseCache.delete(key);
}

export function getRiftboundLatestPrices() {
  return requestRiftboundData<RiftboundLatestPricesResponse>('latest-prices', '/api/riftbound/prices/latest');
}
