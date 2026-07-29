'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, Check, CheckCircle2, Copy, ExternalLink, FileDown, Grid2X2, Home, Info, LayoutList, LoaderCircle, Minus, PackageOpen, Pencil, Plus, QrCode, RotateCcw, Save, Search, Share2, SlidersHorizontal, Star, Trash2, TrendingUp, Upload, X } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type Tesseract from 'tesseract.js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { RiftboundCardPreferenceActions } from '@/components/riftbound-card-preference-actions';
import { RiftboundCompactDeckView } from '@/components/riftbound-compact-deck-view';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getRiftboundCardPreferences, updateRiftboundProfilePreference } from '@/lib/riftbound-community-client';
import { getRiftboundCardDomainTextClass, getRiftboundDeckTypeLabel, getRiftboundDomainTextClass, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundBootstrap, invalidateRiftboundBootstrap, type RiftboundDeck } from '@/lib/riftbound-client';
import {
  RIFTBOUND_DECK_BATTLEFIELD_SIZE,
  RIFTBOUND_DECK_CATEGORY_LABELS,
  RIFTBOUND_DECK_CATEGORY_ORDER,
  RIFTBOUND_DECK_MAIN_SIZE,
  RIFTBOUND_DECK_MAX_COUNT,
  RIFTBOUND_DECK_MAX_CHAMPION_UNITS,
  RIFTBOUND_DECK_MAX_COPIES,
  RIFTBOUND_DECK_RUNE_SIZE,
  RIFTBOUND_DECK_SIDEBOARD_SIZE,
  getRiftboundDeckCardCategory,
  getRiftboundDeckTotals,
  hasMatchingRiftboundChampionTag,
  isRiftboundCardInLegendIdentity,
  isRiftboundChampionUnit,
  validateRiftboundDeck,
  type RiftboundDeckCategory,
  type RiftboundDeckCardSelection,
} from '@/lib/riftbound-decks';

type InventoryTab = 'global' | 'inventory' | 'sets';
type RiftboundDeckViewMode = 'card' | 'list' | 'compact';

type SetSourceTab = 'global' | 'inventory';
type CollectionShareKind = 'collection' | 'set' | 'deck';
type CollectionShareMetadata = {
  createdBy: string;
  createdAt: string;
};
type SetOwnershipFilter = 'all' | 'owned' | 'missing';

type InventoryItem = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

type InventoryMutationResponse = {
  items?: InventoryItem[];
  error?: string;
};

type RiftboundSetCard = {
  card_id: string;
  quantity: number;
};

type RiftboundSet = {
  id: string;
  name: string;
  created_at: string;
  cards: RiftboundSetCard[];
};

type SetMutationResponse = {
  set?: RiftboundSet;
  error?: string;
};

type DeckMutationResponse = {
  deck?: RiftboundDeck;
  error?: string;
};

type InventoryChange = {
  cardId: string;
  finish: InventoryItem['finish'];
  delta: number;
};

type RiftboundPriceHistoryEntry = {
  date: string;
  finish: InventoryItem['finish'];
  price: number | null;
};

type RiftboundPriceHistoryResponse = {
  history?: RiftboundPriceHistoryEntry[];
  error?: string;
};

type RiftboundCollectionValueHistoryEntry = {
  date: string;
  value: number;
  pricedCopies: number;
  totalCopies: number;
};

type RiftboundCollectionValueHistoryResponse = {
  history?: RiftboundCollectionValueHistoryEntry[];
  error?: string;
};

type RiftboundLatestPrice = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

type RiftboundScanMatch = {
  card: RiftboundCard;
  score: number;
};

const RIFTBOUND_SCAN_ASPECT_RATIO = 3 / 4;
const RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD = 0.5;
const RIFTBOUND_SCAN_LOCAL_RETRY_THRESHOLD = 0.28;
const RIFTBOUND_SCAN_AUTO_ADD_THRESHOLD = 0.8;
const RIFTBOUND_OCR_SINGLE_LINE_MODE = '7' as Tesseract.PSM;
const RIFTBOUND_OCR_SINGLE_BLOCK_MODE = '6' as Tesseract.PSM;

export type RiftboundSortMode =
  | 'none'
  | 'market-asc'
  | 'market-desc'
  | 'name-asc'
  | 'name-desc'
  | 'number-asc'
  | 'number-desc'
  | 'rarity-asc'
  | 'rarity-desc'
  | 'might-asc'
  | 'might-desc'
  | 'energy-asc'
  | 'energy-desc'
  | 'power-asc'
  | 'power-desc'
  | 'quantity-asc'
  | 'quantity-desc';

type CachedRiftboundPriceHistory = {
  fetchedAt: number;
  history: RiftboundPriceHistoryEntry[];
};

type CachedRiftboundCollectionValueHistory = {
  fetchedAt: number;
  history: RiftboundCollectionValueHistoryEntry[];
};

export type RiftboundCardFilters = {
  setCode: string[];
  rarity: string[];
  cardType: string[];
  domain: string[];
  energyCost: string[];
  powerCost: string[];
  might: string[];
  minPrice: string;
  maxPrice: string;
};

export type RiftboundCategoricalFilterField = Exclude<keyof RiftboundCardFilters, 'minPrice' | 'maxPrice'>;

const ALL_FILTER_VALUE = 'all';
const PRICE_HISTORY_DAYS = 30;
const PRICE_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PRICE_HISTORY_STORAGE_PREFIX = 'knowleague:riftbound-price-history:v1:';
const PRICE_HISTORY_STORAGE_LIMIT = 100;
const RIFTBOUND_MARKET_VALUE_REFRESH_NOTE = 'Daily refresh at 6:00 AM EST.';
const priceHistoryMemoryCache = new Map<string, CachedRiftboundPriceHistory>();
const priceHistoryRequests = new Map<string, Promise<RiftboundPriceHistoryEntry[]>>();
const collectionValueHistoryMemoryCache = new Map<string, CachedRiftboundCollectionValueHistory>();
const collectionValueHistoryRequests = new Map<string, Promise<RiftboundCollectionValueHistoryEntry[]>>();

function parsePriceHistory(value: unknown): RiftboundPriceHistoryEntry[] | null {
  if (!Array.isArray(value)) return null;

  return value.flatMap((entry): RiftboundPriceHistoryEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<RiftboundPriceHistoryEntry>;
    if (
      typeof candidate.date !== 'string'
      || (candidate.finish !== 'normal' && candidate.finish !== 'foil')
      || (candidate.price !== null && (typeof candidate.price !== 'number' || !Number.isFinite(candidate.price)))
    ) {
      return [];
    }

    return [{ date: candidate.date, finish: candidate.finish, price: candidate.price }];
  });
}

function getPriceHistoryCacheKey(cardId: string, snapshotDate?: string | null) {
  return `${cardId}:${snapshotDate || 'latest'}`;
}

function getPriceHistoryStorageKey(cardId: string, snapshotDate?: string | null) {
  return `${PRICE_HISTORY_STORAGE_PREFIX}${getPriceHistoryCacheKey(cardId, snapshotDate)}`;
}

function getCachedPriceHistory(cardId: string, snapshotDate?: string | null) {
  const cacheKey = getPriceHistoryCacheKey(cardId, snapshotDate);
  const now = Date.now();
  const memoryEntry = priceHistoryMemoryCache.get(cacheKey);
  if (memoryEntry && now - memoryEntry.fetchedAt < PRICE_HISTORY_CACHE_TTL_MS) {
    return memoryEntry.history;
  }
  if (memoryEntry) priceHistoryMemoryCache.delete(cacheKey);

  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(getPriceHistoryStorageKey(cardId, snapshotDate));
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue) as Partial<CachedRiftboundPriceHistory>;
    const history = parsePriceHistory(parsedValue.history);
    if (typeof parsedValue.fetchedAt !== 'number' || !Number.isFinite(parsedValue.fetchedAt) || !history || now - parsedValue.fetchedAt >= PRICE_HISTORY_CACHE_TTL_MS) {
      return null;
    }

    priceHistoryMemoryCache.set(cacheKey, { fetchedAt: parsedValue.fetchedAt, history });
    return history;
  } catch {
    return null;
  }
}

function prunePriceHistoryStorage() {
  if (typeof window === 'undefined') return;

  const entries: Array<{ key: string; fetchedAt: number }> = [];
  const now = Date.now();

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(PRICE_HISTORY_STORAGE_PREFIX)) continue;

      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) continue;
      const parsedValue = JSON.parse(rawValue) as Partial<CachedRiftboundPriceHistory>;
      if (typeof parsedValue.fetchedAt !== 'number' || now - parsedValue.fetchedAt >= PRICE_HISTORY_CACHE_TTL_MS) {
        window.localStorage.removeItem(key);
        continue;
      }
      entries.push({ key, fetchedAt: parsedValue.fetchedAt });
    }

    entries.sort((left, right) => left.fetchedAt - right.fetchedAt);
    entries.slice(0, Math.max(0, entries.length - PRICE_HISTORY_STORAGE_LIMIT)).forEach((entry) => window.localStorage.removeItem(entry.key));
  } catch {
    // Browser storage is an optimization; an unavailable or full cache must not affect the graph.
  }
}

function cachePriceHistory(cardId: string, snapshotDate: string | null | undefined, history: RiftboundPriceHistoryEntry[]) {
  const cachedEntry = { fetchedAt: Date.now(), history };
  priceHistoryMemoryCache.set(getPriceHistoryCacheKey(cardId, snapshotDate), cachedEntry);

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getPriceHistoryStorageKey(cardId, snapshotDate), JSON.stringify(cachedEntry));
    prunePriceHistoryStorage();
  } catch {
    // Browser storage is an optimization; the in-memory cache remains available.
  }
}

function loadPriceHistory(cardId: string, snapshotDate?: string | null) {
  const cacheKey = getPriceHistoryCacheKey(cardId, snapshotDate);
  const cachedHistory = getCachedPriceHistory(cardId, snapshotDate);
  if (cachedHistory) return Promise.resolve(cachedHistory);

  const existingRequest = priceHistoryRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const snapshotQuery = snapshotDate ? `&snapshot=${encodeURIComponent(snapshotDate)}` : '';
  const request = fetch(`/api/riftbound/prices/${encodeURIComponent(cardId)}?days=${PRICE_HISTORY_DAYS}${snapshotQuery}`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      const data = await response.json() as RiftboundPriceHistoryResponse;
      if (!response.ok) throw new Error(data.error || 'Unable to load market value history.');
      const history = data.history ?? [];
      cachePriceHistory(cardId, snapshotDate, history);
      return history;
    })
    .finally(() => {
      priceHistoryRequests.delete(cacheKey);
    });

  priceHistoryRequests.set(cacheKey, request);
  return request;
}

function loadCollectionValueHistory(userId: string, accessToken: string) {
  const cachedEntry = collectionValueHistoryMemoryCache.get(userId);
  if (cachedEntry && Date.now() - cachedEntry.fetchedAt < 5 * 60 * 1000) {
    return Promise.resolve(cachedEntry.history);
  }

  const existingRequest = collectionValueHistoryRequests.get(userId);
  if (existingRequest) return existingRequest;

  const request = fetch('/api/riftbound/collection/value-history?days=365', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
    .then(async (response) => {
      const data = await response.json() as RiftboundCollectionValueHistoryResponse;
      if (!response.ok) throw new Error(data.error || 'Unable to load collection value history.');
      const history = data.history ?? [];
      collectionValueHistoryMemoryCache.set(userId, { fetchedAt: Date.now(), history });
      return history;
    })
    .finally(() => {
      collectionValueHistoryRequests.delete(userId);
    });

  collectionValueHistoryRequests.set(userId, request);
  return request;
}

const emptyFilters: RiftboundCardFilters = {
  setCode: [ALL_FILTER_VALUE],
  rarity: [ALL_FILTER_VALUE],
  cardType: [ALL_FILTER_VALUE],
  domain: [ALL_FILTER_VALUE],
  energyCost: [ALL_FILTER_VALUE],
  powerCost: [ALL_FILTER_VALUE],
  might: [ALL_FILTER_VALUE],
  minPrice: '',
  maxPrice: '',
};

const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
const inventoryRarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
const defaultSortMode: RiftboundSortMode = 'none';

const sortOptions: AppSelectOption<RiftboundSortMode>[] = [
  { value: 'none', label: 'No sort' },
  { value: 'market-asc', label: 'Value · Low to High' },
  { value: 'market-desc', label: 'Value · High to Low' },
  { value: 'name-asc', label: 'Name · A to Z' },
  { value: 'name-desc', label: 'Name · Z to A' },
  { value: 'number-asc', label: 'Number · Ascending' },
  { value: 'number-desc', label: 'Number · Descending' },
  { value: 'rarity-asc', label: 'Rarity · Low to High' },
  { value: 'rarity-desc', label: 'Rarity · High to Low' },
  { value: 'might-asc', label: 'Might · Low to High' },
  { value: 'might-desc', label: 'Might · High to Low' },
  { value: 'energy-asc', label: 'Energy · Low to High' },
  { value: 'energy-desc', label: 'Energy · High to Low' },
  { value: 'power-asc', label: 'Power · Low to High' },
  { value: 'power-desc', label: 'Power · High to Low' },
  { value: 'quantity-asc', label: 'Quantity · Low to High' },
  { value: 'quantity-desc', label: 'Quantity · High to Low' },
];

export const RIFTBOUND_SORT_OPTIONS = sortOptions;
export const RIFTBOUND_RARITY_ORDER = rarityOrder;

export function createRiftboundCardFilters(): RiftboundCardFilters {
  return {
    setCode: [ALL_FILTER_VALUE],
    rarity: [ALL_FILTER_VALUE],
    cardType: [ALL_FILTER_VALUE],
    domain: [ALL_FILTER_VALUE],
    energyCost: [ALL_FILTER_VALUE],
    powerCost: [ALL_FILTER_VALUE],
    might: [ALL_FILTER_VALUE],
    minPrice: '',
    maxPrice: '',
  };
}

const rarityStyles: Record<string, string> = {
  Common: 'text-slate-300',
  Uncommon: 'text-blue-300',
  Rare: 'text-violet-300',
  Epic: 'text-amber-300',
  Showcase: 'text-yellow-200',
  Token: 'text-cyan-200',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

function formatMarketPrice(value: number | null) {
  return value === null ? '—' : currencyFormatter.format(value);
}

function getMarketPriceForFinish(card: RiftboundCard, finish: InventoryItem['finish']) {
  return card.marketPrices ? card.marketPrices[finish] : card.marketPrice;
}

function parseRiftboundFilterPrice(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function matchesRiftboundPriceRange(card: RiftboundCard, minPrice: string, maxPrice: string) {
  const minimum = parseRiftboundFilterPrice(minPrice);
  const maximum = parseRiftboundFilterPrice(maxPrice);
  if (minimum === null && maximum === null) return true;
  if (minimum !== null && maximum !== null && minimum > maximum) return false;

  const prices = [getMarketPriceForFinish(card, 'normal'), getMarketPriceForFinish(card, 'foil')]
    .filter((price): price is number => price !== null && Number.isFinite(price));
  return prices.some((price) => (minimum === null || price >= minimum) && (maximum === null || price <= maximum));
}

const categoricalFilterFields: RiftboundCategoricalFilterField[] = ['setCode', 'rarity', 'cardType', 'domain', 'energyCost', 'powerCost', 'might'];

export function getRiftboundCardFilterCount(filters: RiftboundCardFilters) {
  return categoricalFilterFields.reduce(
    (total, field) => total + filters[field].filter((value) => value !== ALL_FILTER_VALUE).length,
    0,
  ) + (filters.minPrice.trim() ? 1 : 0) + (filters.maxPrice.trim() ? 1 : 0);
}

function getSortMarketValue(card: RiftboundCard) {
  return getMarketPriceForFinish(card, 'foil');
}

function compareNullableNumbers(left: number | null, right: number | null, direction: 1 | -1) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

export function compareRiftboundCards(left: RiftboundCard, right: RiftboundCard, mode: RiftboundSortMode, inventoryByCard: Map<string, number>) {
  if (mode === 'none') return 0;
  const direction: 1 | -1 = mode.endsWith('-desc') ? -1 : 1;
  const [field] = mode.split('-');

  if (field === 'market') {
    return compareNullableNumbers(getSortMarketValue(left), getSortMarketValue(right), direction);
  }
  if (field === 'name') {
    return left.displayName.localeCompare(right.displayName) * direction || left.id.localeCompare(right.id);
  }
  if (field === 'number') {
    return left.setCode.localeCompare(right.setCode) * direction
      || left.collectorNumber.localeCompare(right.collectorNumber, undefined, { numeric: true }) * direction
      || left.id.localeCompare(right.id);
  }
  if (field === 'rarity') {
    return (rarityOrder.indexOf(left.rarity) - rarityOrder.indexOf(right.rarity)) * direction || left.displayName.localeCompare(right.displayName);
  }
  if (field === 'might') return (left.might - right.might) * direction || left.displayName.localeCompare(right.displayName);
  if (field === 'energy') return (left.energyCost - right.energyCost) * direction || left.displayName.localeCompare(right.displayName);
  if (field === 'power') return (left.powerCost - right.powerCost) * direction || left.displayName.localeCompare(right.displayName);
  if (field === 'quantity') return (getCardQuantity(inventoryByCard, left.id) - getCardQuantity(inventoryByCard, right.id)) * direction || left.displayName.localeCompare(right.displayName);

  return 0;
}

function getMarketPriceUpdatedAt(card: RiftboundCard) {
  return card.marketPrices ? card.marketPrices.updatedAt : card.marketPriceUpdatedAt;
}

function getMarketValueRefreshNote() {
  return RIFTBOUND_MARKET_VALUE_REFRESH_NOTE;
}

function formatMarketPriceOrUnavailable(value: number | null) {
  return value === null ? 'N/A' : currencyFormatter.format(value);
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizeRiftboundSearchText(value: string) {
  return normalizeSearchText(value);
}

export function getRiftboundCardSearchText(card: RiftboundCard) {
  return normalizeSearchText([
    card.displayName,
    card.name,
    card.fullName,
    card.setCode,
    card.setName,
    card.numberLabel,
    card.rarity,
    card.cardType,
    card.cardTypeLabels.join(' '),
    card.tags.join(' '),
    card.domains.join(' '),
    card.productDetails,
    card.artist ?? '',
    String(card.energyCost),
    String(card.powerCost),
    String(card.might),
  ].join(' '));
}

function getScanTokenSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  if (left.length < 3 || right.length < 3) return 0;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function getScanCrop(video: HTMLVideoElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceAspectRatio = sourceWidth / sourceHeight;
  let width = sourceWidth;
  let height = sourceHeight;
  let x = 0;
  let y = 0;

  if (sourceAspectRatio > RIFTBOUND_SCAN_ASPECT_RATIO) {
    width = sourceHeight * RIFTBOUND_SCAN_ASPECT_RATIO;
    x = (sourceWidth - width) / 2;
  } else if (sourceAspectRatio < RIFTBOUND_SCAN_ASPECT_RATIO) {
    height = sourceWidth / RIFTBOUND_SCAN_ASPECT_RATIO;
    y = (sourceHeight - height) / 2;
  }

  return { x, y, width, height };
}

function drawRiftboundScanFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const crop = getScanCrop(video);
  const guideInset = 0.08;
  crop.x += crop.width * guideInset;
  crop.y += crop.height * guideInset;
  crop.width *= 1 - (guideInset * 2);
  crop.height *= 1 - (guideInset * 2);
  const outputWidth = 960;
  const outputHeight = Math.round(outputWidth / RIFTBOUND_SCAN_ASPECT_RATIO);
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
  return true;
}

function preprocessRiftboundOcrCanvas(canvas: HTMLCanvasElement, mode: 'grayscale' | 'threshold') {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = (image.data[index] * 0.299) + (image.data[index + 1] * 0.587) + (image.data[index + 2] * 0.114);
    const contrast = Math.max(0, Math.min(255, ((luminance - 128) * 1.55) + 128));
    const value = mode === 'threshold' ? (contrast >= 150 ? 255 : 0) : contrast;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return true;
}

function drawRiftboundScanRegion(source: HTMLCanvasElement, target: HTMLCanvasElement, top: number, bottom: number, mode: 'grayscale' | 'threshold' = 'grayscale') {
  const sourceHeight = source.height * (bottom - top);
  const outputWidth = 960;
  const outputHeight = Math.max(180, Math.round(outputWidth * (sourceHeight / source.width)));
  target.width = outputWidth;
  target.height = outputHeight;

  const context = target.getContext('2d', { willReadFrequently: true });
  if (!context) return false;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, source.height * top, source.width, sourceHeight, 0, 0, outputWidth, outputHeight);
  return preprocessRiftboundOcrCanvas(target, mode);
}

function getVisibleRiftboundScanMatches(matches: RiftboundScanMatch[]) {
  return matches.slice(0, 5);
}

async function requestRiftboundVisionText(canvas: HTMLCanvasElement, accessToken: string) {
  const response = await fetch('/api/riftbound/scan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.78) }),
  });
  const body = await response.json() as { text?: unknown; error?: unknown };
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Cloud card recognition failed.');
  return typeof body.text === 'string' ? body.text.trim() : '';
}

function findRiftboundScanMatches(cards: RiftboundCard[], ocrText: string): RiftboundScanMatch[] {
  const normalizedOcr = normalizeSearchText(ocrText);
  const ocrWords = ocrText
    .split(/\s+/)
    .map((word) => normalizeSearchText(word))
    .filter((word) => word.length >= 2);

  if (!normalizedOcr) return [];

  const rankedMatches = cards.map((card) => {
    const name = normalizeSearchText(card.displayName);
    const nameWords = card.displayName
      .split(/\s+/)
      .map((word) => normalizeSearchText(word))
      .filter((word) => word.length >= 2);
    const number = normalizeSearchText(card.numberLabel);
    const collectorNumber = normalizeSearchText(card.collectorNumber);
    const setCode = normalizeSearchText(card.setCode);
    const nameSimilarity = nameWords.length > 0
      ? nameWords.reduce((total, word) => total + Math.max(...ocrWords.map((ocrWord) => getScanTokenSimilarity(word, ocrWord)), 0), 0) / nameWords.length
      : 0;
    let score = 0;

    if (name && normalizedOcr.includes(name)) score += 0.65;
    score += nameSimilarity * 0.25;
    if (number && normalizedOcr.includes(number)) score += 0.3;
    else if (collectorNumber.length >= 2 && normalizedOcr.includes(collectorNumber)) score += 0.18;
    if (setCode && normalizedOcr.includes(setCode)) score += 0.12;

    return { card, score: Math.min(score, 1) };
  })
    .sort((left, right) => right.score - left.score || left.card.displayName.localeCompare(right.card.displayName));

  const confidentMatches = rankedMatches.filter((match) => match.score >= 0.22);
  return (confidentMatches.length > 0 ? confidentMatches : rankedMatches).slice(0, 5);
}

export function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function jumbledValues(values: string[]) {
  const getSortValue = (value: string) => value.split('').reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 100003, 17);
  return [...values].sort((left, right) => getSortValue(left) - getSortValue(right) || left.localeCompare(right));
}

export function filterOptions(
  values: string[],
  allLabel: string,
  getLabel: (value: string) => string = (value) => value,
): AppSelectOption<string>[] {
  return [
    { value: ALL_FILTER_VALUE, label: allLabel },
    ...values.map((value) => ({ value, label: getLabel(value) })),
  ];
}

function getInventoryKey(cardId: string, finish: InventoryItem['finish']) {
  return `${cardId}:${finish}`;
}

const RIFTBOUND_DRAFT_STORAGE_PREFIX = 'knowleague:riftbound-inventory-draft:';
const RIFTBOUND_CARD_IDS = new Set(RIFTBOUND_CARDS.map((card) => card.id));
const RIFTBOUND_CARD_INDEX_BY_ID = new Map(RIFTBOUND_CARDS.map((card, index) => [card.id, index]));

function parseInventoryTab(value: string | null): InventoryTab | null {
  return value === 'global' || value === 'inventory' || value === 'sets' ? value : null;
}

function encodeShareBytes(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function appendShareVarUint(bytes: number[], value: number) {
  let remaining = Math.max(0, Math.floor(value));
  do {
    let nextByte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) nextByte |= 128;
    bytes.push(nextByte);
  } while (remaining > 0);
}

function appendShareString(bytes: number[], value: string) {
  const encoded = new TextEncoder().encode(value);
  appendShareVarUint(bytes, encoded.length);
  encoded.forEach((byte) => bytes.push(byte));
}

function getCollectionShareBinary(rows: InventoryItem[], kind: CollectionShareKind, title?: string, metadata?: CollectionShareMetadata) {
  const bytes = [3, kind === 'collection' ? 0 : 1];
  appendShareString(bytes, title?.trim() || '');
  appendShareString(bytes, metadata?.createdBy.trim() || '');

  const createdAtMilliseconds = Date.parse(metadata?.createdAt || '');
  appendShareVarUint(bytes, Number.isFinite(createdAtMilliseconds) ? Math.floor(createdAtMilliseconds / 1000) : Math.floor(Date.now() / 1000));

  const encodedRows = rows.flatMap((row) => {
    const cardIndex = RIFTBOUND_CARD_INDEX_BY_ID.get(row.card_id);
    return cardIndex === undefined ? [] : [{ cardIndex, finish: row.finish, quantity: row.quantity }];
  }).sort((left, right) => (left.cardIndex * 2 + (left.finish === 'foil' ? 1 : 0)) - (right.cardIndex * 2 + (right.finish === 'foil' ? 1 : 0)));

  appendShareVarUint(bytes, encodedRows.length);
  let previousKey = 0;
  encodedRows.forEach((row) => {
    const key = (row.cardIndex * 2) + (row.finish === 'foil' ? 1 : 0);
    appendShareVarUint(bytes, key - previousKey);
    appendShareVarUint(bytes, row.quantity);
    previousKey = key;
  });

  return encodeShareBytes(Uint8Array.from(bytes));
}

function getDeckShareBinary(deck: RiftboundDeck, metadata?: CollectionShareMetadata) {
  const bytes = [4, 2];
  appendShareString(bytes, deck.name.trim());
  appendShareString(bytes, metadata?.createdBy.trim() || '');
  const sharedAtMilliseconds = Date.parse(metadata?.createdAt || '');
  appendShareVarUint(bytes, Number.isFinite(sharedAtMilliseconds) ? Math.floor(sharedAtMilliseconds / 1000) : Math.floor(Date.now() / 1000));
  appendShareString(bytes, deck.description?.trim() || '');
  const deckCreatedAtMilliseconds = Date.parse(deck.created_at || '');
  appendShareVarUint(bytes, Number.isFinite(deckCreatedAtMilliseconds) ? Math.floor(deckCreatedAtMilliseconds / 1000) : 0);
  appendShareVarUint(bytes, Math.max(0, (RIFTBOUND_CARD_INDEX_BY_ID.get(deck.legend_card_id) ?? -1) + 1));
  appendShareVarUint(bytes, Math.max(0, (RIFTBOUND_CARD_INDEX_BY_ID.get(deck.chosen_champion_card_id) ?? -1) + 1));
  const categoryCodes: Record<RiftboundDeckCategory, number> = { legend: 0, runes: 1, battlefields: 2, main: 3, sideboard: 4 };
  const encodedCards = deck.cards.flatMap((entry) => {
    const cardIndex = RIFTBOUND_CARD_INDEX_BY_ID.get(entry.card_id);
    if (cardIndex === undefined) return [];
    return [{ cardIndex, category: categoryCodes[entry.category], quantity: entry.quantity }];
  }).sort((left, right) => left.category - right.category || left.cardIndex - right.cardIndex);
  appendShareVarUint(bytes, encodedCards.length);
  encodedCards.forEach((entry) => {
    appendShareVarUint(bytes, entry.cardIndex + 1);
    appendShareVarUint(bytes, entry.category);
    appendShareVarUint(bytes, entry.quantity);
  });
  return encodeShareBytes(Uint8Array.from(bytes));
}

function getCollectionShareUrlForData(data: string) {
  return `${window.location.origin}/inventory/share?d=${encodeURIComponent(data)}`;
}

function getCompactCollectionShareUrl(rows: InventoryItem[], kind: CollectionShareKind = 'collection', title?: string, metadata?: CollectionShareMetadata) {
  return getCollectionShareUrlForData(`b.${getCollectionShareBinary(rows, kind, title, metadata)}`);
}

export function getCompactDeckShareUrl(deck: RiftboundDeck, metadata?: CollectionShareMetadata) {
  return getCollectionShareUrlForData(`b.${getDeckShareBinary(deck, metadata)}`);
}

async function getCollectionShareUrl(rows: InventoryItem[], kind: CollectionShareKind = 'collection', title?: string, metadata?: CollectionShareMetadata) {
  return getCompactCollectionShareUrl(rows, kind, title, metadata);
}

const RIFTBOUND_COLLECTION_JSON_FORMAT = 'knowleague-riftbound-collection';

function downloadCollectionJson(rows: InventoryItem[]) {
  const payload = {
    format: RIFTBOUND_COLLECTION_JSON_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: rows.map((row) => ({
      card_id: row.card_id,
      finish: row.finish,
      quantity: row.quantity,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `knowleague-riftbound-collection-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

const RIFTBOUND_SET_JSON_FORMAT = 'knowleague-riftbound-set';

function downloadSetJson(rows: InventoryItem[], name?: string) {
  const payload = {
    format: RIFTBOUND_SET_JSON_FORMAT,
    version: 1,
    name: name?.trim() || 'Riftbound Set',
    exportedAt: new Date().toISOString(),
    cards: rows.map((row) => ({ card_id: row.card_id, quantity: row.quantity })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(name?.trim() || 'riftbound-set').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'riftbound-set'}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

const RIFTBOUND_DECK_JSON_FORMAT = 'knowleague-riftbound-game-deck';

function downloadDeckJson(deck: RiftboundDeck) {
  const payload = {
    format: RIFTBOUND_DECK_JSON_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    name: deck.name,
    description: deck.description,
    legendCardId: deck.legend_card_id,
    chosenChampionCardId: deck.chosen_champion_card_id,
    cards: deck.cards.map(({ card_id: cardId, category, quantity }) => ({ cardId, category, quantity })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${deck.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'riftbound-deck'}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function parseCollectionJson(value: unknown) {
  const rawRows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { cards?: unknown }).cards)
      ? (value as { cards: unknown[] }).cards
      : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)
        ? (value as { rows: unknown[] }).rows
        : null;

  if (!rawRows) throw new Error('This file is not a valid KnowLeague Riftbound collection JSON file.');
  if (rawRows.length > 5000) throw new Error('The collection JSON contains too many card entries.');

  return rawRows.map((item, index): InventoryItem => {
    if (!item || typeof item !== 'object') throw new Error(`Invalid card entry at index ${index}.`);
    const candidate = item as Partial<InventoryItem>;
    const card = typeof candidate.card_id === 'string'
      ? RIFTBOUND_CARDS.find((entry) => entry.id === candidate.card_id)
      : null;
    if (!card || !RIFTBOUND_CARD_IDS.has(card.id)) throw new Error(`Unknown Riftbound card at index ${index}.`);
    if (candidate.finish !== 'normal' && candidate.finish !== 'foil') throw new Error(`Invalid finish at index ${index}.`);
    if (!getCardFinishOptions(card).includes(candidate.finish)) throw new Error(`The ${card.displayName} card does not support the ${candidate.finish} finish.`);
    if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 1000) {
      throw new Error(`Invalid quantity at index ${index}; quantities must be whole numbers from 1 to 1000.`);
    }

    return {
      card_id: card.id,
      finish: candidate.finish,
      quantity: candidate.quantity,
      updated_at: new Date().toISOString(),
    };
  });
}

function parseSetJson(value: unknown) {
  const source = value && typeof value === 'object' ? value as { name?: unknown; title?: unknown; cards?: unknown; rows?: unknown } : null;
  const rawCards = Array.isArray(source?.cards) ? source.cards : Array.isArray(source?.rows) ? source.rows : null;
  if (!rawCards) throw new Error('This file is not a valid KnowLeague Riftbound set JSON file.');
  if (rawCards.length > 5000) throw new Error('The set JSON contains too many card entries.');

  const quantities = new Map<string, number>();
  rawCards.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Invalid set card entry at index ${index}.`);
    const candidate = item as { card_id?: unknown; quantity?: unknown };
    const card = typeof candidate.card_id === 'string'
      ? RIFTBOUND_CARDS.find((entry) => entry.id === candidate.card_id)
      : null;
    if (!card || !RIFTBOUND_CARD_IDS.has(card.id)) throw new Error(`Unknown Riftbound card at index ${index}.`);
    if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 1000) {
      throw new Error(`Invalid set quantity at index ${index}; quantities must be whole numbers from 1 to 1000.`);
    }
    quantities.set(card.id, (quantities.get(card.id) ?? 0) + candidate.quantity);
  });

  const cards = Array.from(quantities, ([card_id, quantity]) => ({ card_id, quantity }));
  const totalCopies = cards.reduce((total, card) => total + card.quantity, 0);
  if (cards.length === 0 || totalCopies > 5000) throw new Error('A set must contain between 1 and 5000 total card copies.');

  const rawName = typeof source?.name === 'string' ? source.name : typeof source?.title === 'string' ? source.title : '';
  const name = rawName.trim();
  if (!name) throw new Error('The imported set is missing a name.');
  if (name.length > 80) throw new Error('Set names cannot exceed 80 characters.');

  return { name, cards };
}

function parseDeckJson(value: unknown) {
  const source = value && typeof value === 'object' ? value as {
    name?: unknown;
    description?: unknown;
    legendCardId?: unknown;
    legend_card_id?: unknown;
    chosenChampionCardId?: unknown;
    chosen_champion_card_id?: unknown;
    cards?: unknown;
    deck?: unknown;
  } : null;
  const nestedDeck = source?.deck && typeof source.deck === 'object' ? source.deck as typeof source : null;
  const deckSource = nestedDeck ?? source;
  const rawCards = Array.isArray(deckSource?.cards) ? deckSource.cards : null;
  if (!rawCards) throw new Error('This file is not a valid KnowLeague Riftbound game deck JSON file.');
  if (rawCards.length === 0 || rawCards.length > 1180) throw new Error('The game deck JSON must contain between 1 and 1180 card rows.');

  const seenRows = new Set<string>();
  const cards = rawCards.map((item, index): RiftboundDeckCardSelection => {
    if (!item || typeof item !== 'object') throw new Error(`Invalid deck card entry at index ${index}.`);
    const candidate = item as { cardId?: unknown; card_id?: unknown; category?: unknown; quantity?: unknown };
    const cardId = typeof candidate.cardId === 'string' ? candidate.cardId : candidate.card_id;
    const card = typeof cardId === 'string' ? RIFTBOUND_CARDS.find((entry) => entry.id === cardId) : null;
    if (!card) throw new Error(`Unknown Riftbound card at index ${index}.`);
    if (!['legend', 'runes', 'battlefields', 'main', 'sideboard'].includes(String(candidate.category))) {
      throw new Error(`Invalid deck category at index ${index}.`);
    }
    if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 1000) {
      throw new Error(`Invalid quantity at index ${index}; quantities must be whole numbers from 1 to 1000.`);
    }
    const key = `${candidate.category}:${card.id}`;
    if (seenRows.has(key)) throw new Error('The game deck JSON contains duplicate category/card rows.');
    seenRows.add(key);
    return { cardId: card.id, category: candidate.category as RiftboundDeckCategory, quantity: candidate.quantity };
  });

  const name = typeof deckSource?.name === 'string' ? deckSource.name.trim() : '';
  if (!name || name.length > 80) throw new Error('Deck names must be between 1 and 80 characters.');
  const description = typeof deckSource?.description === 'string' ? deckSource.description.trim() : '';
  if (description.length > 500) throw new Error('Deck descriptions must be 500 characters or fewer.');
  const legendCardId = typeof deckSource?.legendCardId === 'string'
    ? deckSource.legendCardId
    : typeof deckSource?.legend_card_id === 'string'
      ? deckSource.legend_card_id
      : '';
  if (!RIFTBOUND_CARD_IDS.has(legendCardId)) throw new Error('The imported deck does not contain a valid Legend card.');
  const chosenChampionCardId = typeof deckSource?.chosenChampionCardId === 'string'
    ? deckSource.chosenChampionCardId
    : typeof deckSource?.chosen_champion_card_id === 'string'
      ? deckSource.chosen_champion_card_id
      : cards.find((entry) => entry.category === 'main' && isRiftboundChampionUnit(RIFTBOUND_CARDS.find((card) => card.id === entry.cardId)!))?.cardId ?? '';

  return { name, description, legendCardId, chosenChampionCardId, cards };
}

function addInventoryRows(rows: InventoryItem[], additions: InventoryItem[]) {
  const quantities = new Map(rows.map((row) => [getInventoryKey(row.card_id, row.finish), { ...row }]));
  additions.forEach((addition) => {
    const key = getInventoryKey(addition.card_id, addition.finish);
    const current = quantities.get(key);
    quantities.set(key, {
      card_id: addition.card_id,
      finish: addition.finish,
      quantity: (current?.quantity ?? 0) + addition.quantity,
      updated_at: addition.updated_at,
    });
  });
  return Array.from(quantities.values());
}

type StoredInventoryDraft = {
  rows: InventoryItem[];
  savedRows: InventoryItem[];
};

function getInventoryDraftStorageKey(userId: string) {
  return `${RIFTBOUND_DRAFT_STORAGE_PREFIX}${userId}`;
}

function parseStoredInventoryRows(value: unknown): InventoryItem[] | null {
  if (!Array.isArray(value)) return null;

  return value.flatMap((item): InventoryItem[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<InventoryItem>;
    if (
      typeof candidate.card_id !== 'string'
      || !RIFTBOUND_CARD_IDS.has(candidate.card_id)
      || (candidate.finish !== 'normal' && candidate.finish !== 'foil')
      || typeof candidate.quantity !== 'number'
      || !Number.isInteger(candidate.quantity)
      || candidate.quantity <= 0
    ) {
      return [];
    }

    return [{
      card_id: candidate.card_id,
      finish: candidate.finish,
      quantity: candidate.quantity,
      updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : new Date().toISOString(),
    }];
  });
}

function readStoredInventoryDraft(storageKey: string): StoredInventoryDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (rawValue === null) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (Array.isArray(parsedValue)) {
      return { rows: parseStoredInventoryRows(parsedValue) ?? [], savedRows: [] };
    }
    if (!parsedValue || typeof parsedValue !== 'object') return null;

    const candidate = parsedValue as { rows?: unknown; savedRows?: unknown };
    const rows = parseStoredInventoryRows(candidate.rows);
    const savedRows = parseStoredInventoryRows(candidate.savedRows);
    return rows && savedRows ? { rows, savedRows } : null;
  } catch {
    return null;
  }
}

function persistInventoryDraft(storageKey: string, rows: InventoryItem[], savedRows: InventoryItem[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ rows, savedRows }));
  } catch {
    // Browser storage can be unavailable or full; the in-memory draft remains usable.
  }
}

function clearInventoryDraft(storageKey: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures; the server state is still authoritative after saving.
  }
}

function getCardQuantity(inventoryByCard: Map<string, number>, cardId: string) {
  return inventoryByCard.get(cardId) ?? 0;
}

function getFinishQuantity(inventoryByFinish: Map<string, number>, cardId: string, finish: InventoryItem['finish']) {
  return inventoryByFinish.get(getInventoryKey(cardId, finish)) ?? 0;
}

function getCardFinishOptions(card: RiftboundCard): InventoryItem['finish'][] {
  const finishOrder: InventoryItem['finish'][] = ['normal', 'foil'];
  const configuredFinishes = finishOrder.filter((finish) => card.finishOptions.includes(finish));
  return configuredFinishes.length > 0 ? configuredFinishes : [card.defaultFinish];
}

function getFinishLabel(finish: InventoryItem['finish']) {
  return finish === 'foil' ? 'Foil' : 'Normal';
}

function updateInventoryRows(rows: InventoryItem[], card: RiftboundCard, finish: InventoryItem['finish'], delta: 1 | -1) {
  const key = getInventoryKey(card.id, finish);
  const index = rows.findIndex((row) => getInventoryKey(row.card_id, row.finish) === key);
  const currentQuantity = index === -1 ? 0 : rows[index].quantity;
  const nextQuantity = currentQuantity + delta;

  if (nextQuantity <= 0) {
    return index === -1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index);
  }

  if (index === -1) {
    return [...rows, {
      card_id: card.id,
      finish,
      quantity: nextQuantity,
      updated_at: new Date().toISOString(),
    }];
  }

  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: nextQuantity } : row);
}

export function toggleFilterValue(values: string[], nextValue: string) {
  if (nextValue === ALL_FILTER_VALUE) return [ALL_FILTER_VALUE];

  const selectedValues = values.filter((value) => value !== ALL_FILTER_VALUE);
  const nextValues = selectedValues.includes(nextValue)
    ? selectedValues.filter((value) => value !== nextValue)
    : [...selectedValues, nextValue];

  return nextValues.length > 0 ? nextValues : [ALL_FILTER_VALUE];
}

export function matchesFilter(values: string[], candidates: string | string[]) {
  if (values.includes(ALL_FILTER_VALUE)) return true;
  const candidateValues = Array.isArray(candidates) ? candidates : [candidates];
  return candidateValues.some((candidate) => values.includes(candidate));
}

function getInventoryChanges(savedRows: InventoryItem[], draftRows: InventoryItem[]) {
  const entries = new Map<string, {
    cardId: string;
    finish: InventoryItem['finish'];
    savedQuantity: number;
    draftQuantity: number;
  }>();

  savedRows.forEach((row) => {
    entries.set(getInventoryKey(row.card_id, row.finish), {
      cardId: row.card_id,
      finish: row.finish,
      savedQuantity: row.quantity,
      draftQuantity: 0,
    });
  });

  draftRows.forEach((row) => {
    const key = getInventoryKey(row.card_id, row.finish);
    const current = entries.get(key);
    entries.set(key, {
      cardId: row.card_id,
      finish: row.finish,
      savedQuantity: current?.savedQuantity ?? 0,
      draftQuantity: row.quantity,
    });
  });

  return Array.from(entries.values()).flatMap<InventoryChange>((entry) => {
    const delta = entry.draftQuantity - entry.savedQuantity;
    return delta === 0 ? [] : [{ cardId: entry.cardId, finish: entry.finish, delta }];
  });
}

function updateSetBuilderRows(rows: Record<string, number>, cardId: string, delta: 1 | -1) {
  const nextQuantity = (rows[cardId] ?? 0) + delta;
  const nextRows = { ...rows };
  if (nextQuantity <= 0) delete nextRows[cardId];
  else nextRows[cardId] = nextQuantity;
  return nextRows;
}

function expandSetCards(set: RiftboundSet, cards: RiftboundCard[] = RIFTBOUND_CARDS) {
  return set.cards.flatMap((entry) => {
    const card = cards.find((candidate) => candidate.id === entry.card_id);
    if (!card) return [];
    return Array.from({ length: entry.quantity }, (_, index) => ({ card, copyIndex: index, key: `${set.id}:${entry.card_id}:${index}` }));
  });
}

type DeckBuilderRows = Record<RiftboundDeckCategory, Record<string, number>>;

function createEmptyDeckBuilderRows(): DeckBuilderRows {
  return {
    legend: {},
    runes: {},
    battlefields: {},
    main: {},
    sideboard: {},
  };
}

function flattenDeckBuilderRows(rows: DeckBuilderRows): RiftboundDeckCardSelection[] {
  return RIFTBOUND_DECK_CATEGORY_ORDER.flatMap((category) => Object.entries(rows[category]).map(([cardId, quantity]) => ({
    cardId,
    category,
    quantity,
  })));
}

function getDeckBuilderRows(deck: RiftboundDeck): DeckBuilderRows {
  const rows = createEmptyDeckBuilderRows();
  deck.cards.forEach((entry) => {
    rows[entry.category][entry.card_id] = entry.quantity;
  });
  return rows;
}

type ExpandedRiftboundDeckCard = {
  card: RiftboundCard;
  category: RiftboundDeckCategory;
  copyIndex: number;
  key: string;
};

function expandRiftboundDeckCards(deck: RiftboundDeck, cards: RiftboundCard[] = RIFTBOUND_CARDS): ExpandedRiftboundDeckCard[] {
  return deck.cards.flatMap((entry) => {
    const card = cards.find((candidate) => candidate.id === entry.card_id);
    if (!card) return [];
    return Array.from({ length: entry.quantity }, (_, index) => ({
      card,
      category: entry.category,
      copyIndex: index,
      key: `${deck.id}:${entry.category}:${entry.card_id}:${index}`,
    }));
  });
}

function getDeckBuilderChampionCardId(rows: DeckBuilderRows, cardsById: ReadonlyMap<string, RiftboundCard>) {
  return Object.entries(rows.main).find(([cardId, quantity]) => {
    const card = cardsById.get(cardId);
    return quantity > 0 && (card ? isRiftboundChampionUnit(card) : false);
  })?.[0] ?? null;
}

function getDeckCategoryCards(
  cards: RiftboundCard[],
  category: RiftboundDeckCategory,
  rows: DeckBuilderRows,
  cardsById: ReadonlyMap<string, RiftboundCard>,
) {
  const legend = Object.keys(rows.legend)[0] ? cardsById.get(Object.keys(rows.legend)[0]) ?? null : null;
  const selectedLegendId = Object.keys(rows.legend)[0] ?? null;
  const selectedChampionIds = new Set(
    Object.entries(rows.main)
      .filter(([cardId, quantity]) => {
        const card = cardsById.get(cardId);
        return quantity > 0 && (card ? isRiftboundChampionUnit(card) : false);
      })
      .map(([cardId]) => cardId),
  );

  return cards.filter((card) => {
    const cardCategory = getRiftboundDeckCardCategory(card);
    const isExpectedCategory = category === 'sideboard' ? cardCategory === 'main' : cardCategory === category;
    if (!isExpectedCategory) return false;

    if ((category === 'runes' || category === 'main' || category === 'sideboard') && legend && !isRiftboundCardInLegendIdentity(card, legend)) {
      return false;
    }

    if (category === 'legend' && selectedChampionIds.size > 0) {
      return card.id === selectedLegendId || Array.from(selectedChampionIds).every((championId) => {
        const champion = cardsById.get(championId);
        return champion ? hasMatchingRiftboundChampionTag(champion, card) : false;
      });
    }

    if ((category === 'main' || category === 'sideboard') && isRiftboundChampionUnit(card) && legend) {
      return selectedChampionIds.has(card.id) || hasMatchingRiftboundChampionTag(card, legend);
    }

    return true;
  });
}

function updateDeckBuilderRows(
  rows: DeckBuilderRows,
  category: RiftboundDeckCategory,
  card: RiftboundCard,
  delta: 1 | -1,
  cardsById: ReadonlyMap<string, RiftboundCard>,
) {
  const nextRows: DeckBuilderRows = {
    legend: { ...rows.legend },
    runes: { ...rows.runes },
    battlefields: { ...rows.battlefields },
    main: { ...rows.main },
    sideboard: { ...rows.sideboard },
  };

  if (category === 'legend') {
    if (delta > 0) {
      nextRows.legend = { [card.id]: 1 };
      const nextLegend = cardsById.get(card.id) ?? null;
      if (nextLegend) {
        (['runes', 'main', 'sideboard'] as const).forEach((dependentCategory) => {
          Object.keys(nextRows[dependentCategory]).forEach((cardId) => {
            const selectedCard = cardsById.get(cardId);
            if (selectedCard && !isRiftboundCardInLegendIdentity(selectedCard, nextLegend)) {
              delete nextRows[dependentCategory][cardId];
            }
          });
        });
      }
    } else {
      delete nextRows.legend[card.id];
    }
    return nextRows;
  }

  const totals = getRiftboundDeckTotals(flattenDeckBuilderRows(rows));
  const categoryLimit = category === 'runes'
    ? RIFTBOUND_DECK_RUNE_SIZE
    : category === 'battlefields'
      ? RIFTBOUND_DECK_BATTLEFIELD_SIZE
      : category === 'sideboard'
        ? RIFTBOUND_DECK_SIDEBOARD_SIZE
        : category === 'main'
          ? RIFTBOUND_DECK_MAIN_SIZE
          : null;
  if (delta > 0 && categoryLimit !== null && totals[category] >= categoryLimit) return rows;

  if (delta > 0 && category === 'battlefields') {
    if ((nextRows.battlefields[card.id] ?? 0) >= 1) return rows;
    const cardName = card.displayName;
    const hasDuplicateName = Object.keys(nextRows.battlefields).some((cardId) => {
      const selectedCard = cardsById.get(cardId);
      return selectedCard && selectedCard.id !== card.id && selectedCard.displayName === cardName;
    });
    if (hasDuplicateName) return rows;
  }

  if (delta > 0 && (category === 'main' || category === 'sideboard')) {
    const selectedCopies = [...Object.entries(nextRows.main), ...Object.entries(nextRows.sideboard)].reduce((total, [cardId, quantity]) => {
      const selectedCard = cardsById.get(cardId);
      return total + (selectedCard?.displayName === card.displayName ? quantity : 0);
    }, 0);
    if (selectedCopies >= RIFTBOUND_DECK_MAX_COPIES) return rows;

    if ((category === 'main' || category === 'sideboard') && isRiftboundChampionUnit(card)) {
      const championCopies = [...Object.entries(nextRows.main), ...Object.entries(nextRows.sideboard)].reduce((total, [cardId, quantity]) => {
        const selectedCard = cardsById.get(cardId);
        return total + (selectedCard && isRiftboundChampionUnit(selectedCard) ? quantity : 0);
      }, 0);
      if (championCopies >= RIFTBOUND_DECK_MAX_CHAMPION_UNITS) return rows;
    }
  }

  const nextQuantity = (nextRows[category][card.id] ?? 0) + delta;
  if (nextQuantity <= 0) delete nextRows[category][card.id];
  else nextRows[category][card.id] = nextQuantity;
  return nextRows;
}

function getSetShareRows(set: RiftboundSet, cards: RiftboundCard[] = RIFTBOUND_CARDS): InventoryItem[] {
  return set.cards.flatMap((entry) => {
    const card = cards.find((candidate) => candidate.id === entry.card_id);
    if (!card) return [];
    return [{
      card_id: card.id,
      finish: card.defaultFinish,
      quantity: entry.quantity,
      updated_at: set.created_at,
    }];
  });
}

function getDeckShareRows(deck: RiftboundDeck, cards: RiftboundCard[] = RIFTBOUND_CARDS): InventoryItem[] {
  const quantities = new Map<string, InventoryItem>();
  deck.cards.forEach((entry) => {
    const card = cards.find((candidate) => candidate.id === entry.card_id);
    if (!card) return;
    const finish = card.defaultFinish;
    const key = getInventoryKey(card.id, finish);
    const current = quantities.get(key);
    quantities.set(key, {
      card_id: card.id,
      finish,
      quantity: (current?.quantity ?? 0) + entry.quantity,
      updated_at: deck.created_at,
    });
  });
  return Array.from(quantities.values());
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-xs font-bold text-slate-200" title={value}>{value}</dd>
    </div>
  );
}

function DomainDetailValue({ domains }: { domains: string[] }) {
  const values = domains.length > 0 ? domains : ['Colorless'];
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Domain</dt>
      <dd className="mt-1 flex flex-wrap gap-x-1 text-xs font-bold" title={values.join('; ')}>
        {values.map((domain, index) => <span key={domain} className={getRiftboundDomainTextClass(domain)}>{index > 0 ? '; ' : ''}{domain}</span>)}
      </dd>
    </div>
  );
}

function buildHistoryLineSegments(
  values: Array<number | null>,
  getX: (index: number) => number,
  getY: (value: number) => number,
) {
  const segments: string[] = [];
  let points: string[] = [];

  values.forEach((value, index) => {
    if (value === null) {
      if (points.length > 0) segments.push(points.join(' '));
      points = [];
      return;
    }

    points.push(`${getX(index)},${getY(value)}`);
  });

  if (points.length > 0) segments.push(points.join(' '));
  return segments;
}

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatHistoryTooltipDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date)} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

function formatDeckCreatedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

type HistoryPointTooltip = {
  chartWidth: number;
  chartHeight: number;
  x: number;
  y: number;
  label: string;
  value: string;
  date: string;
  detail?: string;
};

function HistoryChartTooltip({ point }: { point: HistoryPointTooltip }) {
  const placeBelow = point.y < 70;
  const horizontalAlignment = point.x / point.chartWidth <= 0.18
    ? 'start'
    : point.x / point.chartWidth >= 0.82
      ? 'end'
      : 'center';
  const horizontalClassName = horizontalAlignment === 'start'
    ? 'translate-x-0'
    : horizontalAlignment === 'end'
      ? '-translate-x-full'
      : '-translate-x-1/2';
  return (
    <div
      className={`pointer-events-none absolute z-10 w-max max-w-[14rem] rounded-xl border border-amber-200/40 bg-slate-950 px-3 py-2 text-left text-xs text-slate-100 ${horizontalClassName} ${placeBelow ? '' : '-translate-y-full'}`}
      style={{ left: `${(point.x / point.chartWidth) * 100}%`, top: `${(point.y / point.chartHeight) * 100}%`, marginTop: placeBelow ? '0.5rem' : '-0.5rem' }}
      role="status"
    >
      <p className="whitespace-nowrap font-black text-amber-200">{point.value} - {point.date}</p>
      <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">{point.label}</p>
      {point.detail ? <p className="mt-1 text-[0.65rem] text-slate-400">{point.detail}</p> : null}
    </div>
  );
}

function RiftboundPriceHistoryChart({ history }: { history: RiftboundPriceHistoryEntry[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<HistoryPointTooltip | null>(null);
  const dates = useMemo(
    () => Array.from(new Set(history.map((entry) => entry.date))).sort(),
    [history],
  );
  const valuesByKey = useMemo(
    () => new Map(history.map((entry) => [`${entry.date}:${entry.finish}`, entry.price])),
    [history],
  );
  const series = [
    { finish: 'normal' as const, label: 'Normal', color: '#7dd3fc' },
    { finish: 'foil' as const, label: 'Foil', color: '#fcd34d' },
  ].map((entry) => ({
    ...entry,
    values: dates.map((date) => valuesByKey.get(`${date}:${entry.finish}`) ?? null),
  })).filter((entry) => entry.values.some((value) => value !== null));

  const prices = history.flatMap((entry) => entry.price === null ? [] : [entry.price]);
  if (dates.length === 0 || prices.length === 0 || series.length === 0) {
    return <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">No captured market values yet.</p>;
  }

  const width = 720;
  const height = 250;
  const plotLeft = 52;
  const plotRight = 704;
  const plotTop = 20;
  const plotBottom = 188;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const maxPrice = Math.max(...prices, 0.01);
  const getX = (index: number) => dates.length === 1
    ? plotLeft + (plotWidth / 2)
    : plotLeft + ((index / (dates.length - 1)) * plotWidth);
  const getY = (value: number) => plotBottom - ((value / maxPrice) * plotHeight);
  const labelIndexes = Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]));
  const yValues = [maxPrice, maxPrice / 2, 0];

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/50 p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((entry) => (
            <span key={entry.finish} className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
        <span className="text-[0.65rem] font-semibold text-slate-500">USD per card</span>
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Riftbound card market value history line graph" className="h-auto min-w-[36rem] w-full">
        {yValues.map((value) => {
          const y = getY(value);
          return (
            <g key={value}>
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
              <text x={plotLeft - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatMarketPriceOrUnavailable(value)}</text>
            </g>
          );
        })}
        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="rgba(148,163,184,0.3)" />
        {series.map((entry) => buildHistoryLineSegments(entry.values, getX, getY).map((points, index) => (
          <polyline key={`${entry.finish}-${index}`} points={points} fill="none" stroke={entry.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )))}
        {series.flatMap((entry) => entry.values.map((value, index) => value === null ? null : (() => {
          const point = {
            chartWidth: width,
            chartHeight: height,
            x: getX(index),
            y: getY(value),
            label: entry.label,
            value: formatMarketPriceOrUnavailable(value),
            date: formatHistoryTooltipDate(dates[index]),
          };
          return <circle
            key={`${entry.finish}-${dates[index]}`}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="#030712"
            stroke={entry.color}
            strokeWidth="2"
            tabIndex={0}
            role="img"
            aria-label={`${point.label}: ${point.value} - ${point.date}`}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
            onFocus={() => setHoveredPoint(point)}
            onBlur={() => setHoveredPoint(null)}
          />;
        })()))}
        {labelIndexes.map((index) => (
          <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill="#64748b" fontSize="11">{formatHistoryDate(dates[index])}</text>
        ))}
      </svg>
      {hoveredPoint ? <HistoryChartTooltip point={hoveredPoint} /> : null}
      </div>
    </div>
  );
}

function MarketValueSourceInfo() {
  return (
    <span className="group relative inline-flex align-middle">
      <Info
        size={14}
        tabIndex={0}
        aria-label="Market value source information"
        className="text-slate-500 outline-none transition group-hover:text-amber-200 group-focus-within:text-amber-200"
      />
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-200 group-hover:block group-focus-within:block">
        Estimated from captured market prices provided by our pricing source. It is not a guaranteed sale price. {getMarketValueRefreshNote()}
      </span>
    </span>
  );
}

function MarketValueRefreshNote() {
  return <p className="mt-2 text-[0.65rem] font-semibold text-slate-500">{getMarketValueRefreshNote()}</p>;
}

function RiftboundCollectionValueHistoryChart({ history }: { history: RiftboundCollectionValueHistoryEntry[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<HistoryPointTooltip | null>(null);
  if (history.length === 0) {
    return <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">No collection value snapshots are available yet.</p>;
  }

  const width = 760;
  const height = 270;
  const plotLeft = 58;
  const plotRight = 728;
  const plotTop = 22;
  const plotBottom = 198;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const maxValue = Math.max(...history.map((entry) => entry.value), 0.01);
  const getX = (index: number) => history.length === 1
    ? plotLeft + (plotWidth / 2)
    : plotLeft + ((index / (history.length - 1)) * plotWidth);
  const getY = (value: number) => plotBottom - ((value / maxValue) * plotHeight);
  const points = history.map((entry, index) => `${getX(index)},${getY(entry.value)}`).join(' ');
  const labelIndexes = Array.from(new Set([0, Math.floor((history.length - 1) / 2), history.length - 1]));
  const yValues = [maxValue, maxValue / 2, 0];

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/50 p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <span className="inline-flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Collection value
        </span>
        <span className="text-[0.65rem] font-semibold text-slate-500">USD · saved inventory</span>
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Riftbound collection market value history line graph" className="h-auto min-w-[36rem] w-full">
        {yValues.map((value) => {
          const y = getY(value);
          return (
            <g key={value}>
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
              <text x={plotLeft - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatMarketPrice(value)}</text>
            </g>
          );
        })}
        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="rgba(148,163,184,0.3)" />
        <polyline points={points} fill="none" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {history.map((entry, index) => {
          const point = {
            chartWidth: width,
            chartHeight: height,
            x: getX(index),
            y: getY(entry.value),
            label: 'Collection value',
            value: formatMarketPrice(entry.value),
            date: formatHistoryTooltipDate(entry.date),
            detail: `${entry.pricedCopies} cards priced`,
          };
          return <circle
            key={entry.date}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="#030712"
            stroke="#6ee7b7"
            strokeWidth="2"
            tabIndex={0}
            role="img"
            aria-label={`${point.value} - ${point.date}; ${point.detail}`}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
            onFocus={() => setHoveredPoint(point)}
            onBlur={() => setHoveredPoint(null)}
          />;
        })}
        {labelIndexes.map((index) => (
          <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill="#64748b" fontSize="11">{formatHistoryDate(history[index].date)}</text>
        ))}
      </svg>
      {hoveredPoint ? <HistoryChartTooltip point={hoveredPoint} /> : null}
      </div>
    </div>
  );
}

function InventoryAdjustButton({
  label,
  disabled,
  compact = false,
  onAdjust,
  children,
}: {
  label: string;
  disabled: boolean;
  compact?: boolean;
  onAdjust: () => void;
  children: ReactNode;
}) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onAdjust();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) onAdjust();
  };

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
    >
      {children}
    </button>
  );
}

function FinishInventoryControls({
  card,
  finish,
  quantity,
  pending,
  onAdjust,
}: {
  card: RiftboundCard;
  finish: InventoryItem['finish'];
  quantity: number;
  pending: boolean;
  onAdjust: (finish: InventoryItem['finish'], delta: 1 | -1) => void;
}) {
  const finishLabel = getFinishLabel(finish);

  return (
    <div
      className={`flex min-w-0 items-center justify-center gap-0.5 rounded-xl border p-0.5 ${finish === 'foil' ? 'border-amber-200/40 bg-gradient-to-br from-amber-200/20 via-white/10 to-violet-300/20 shadow-[0_0_14px_rgba(251,191,36,0.12)]' : 'border-white/10 bg-slate-900/80'}`}
      title={`${finishLabel} inventory controls`}
    >
      <InventoryAdjustButton
        label={`Remove one ${finishLabel.toLowerCase()} ${card.displayName}`}
        disabled={quantity === 0 || pending}
        compact
        onAdjust={() => onAdjust(finish, -1)}
      >
        <Minus size={14} />
      </InventoryAdjustButton>
      <span className="min-w-5 text-center text-sm font-black text-amber-200" aria-label={`${quantity} ${finishLabel.toLowerCase()} copies owned`}>{quantity}</span>
      <InventoryAdjustButton
        label={`Add one ${finishLabel.toLowerCase()} ${card.displayName}`}
        disabled={pending}
        compact
        onAdjust={() => onAdjust(finish, 1)}
      >
        <Plus size={14} />
      </InventoryAdjustButton>
    </div>
  );
}

function SetCardControls({
  card,
  quantity,
  onAdjust,
}: {
  card: RiftboundCard;
  quantity: number;
  onAdjust: (delta: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0.5 rounded-xl border border-amber-200/30 bg-amber-300/10 p-0.5">
      <InventoryAdjustButton label={`Remove ${card.displayName} from set`} disabled={quantity === 0} compact onAdjust={() => onAdjust(-1)}><Minus size={14} /></InventoryAdjustButton>
      <span className="min-w-5 text-center text-sm font-black text-amber-200" aria-label={`${quantity} copies selected`}>{quantity}</span>
      <InventoryAdjustButton label={`Add ${card.displayName} to set`} disabled={false} compact onAdjust={() => onAdjust(1)}><Plus size={14} /></InventoryAdjustButton>
    </div>
  );
}

function RiftboundDeckFavoriteButton({ deckId, session }: { deckId: string; session: Session | null }) {
  const [favoriteDeckIds, setFavoriteDeckIds] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) {
      setFavoriteDeckIds(null);
      return;
    }
    let cancelled = false;
    void getRiftboundCardPreferences(session)
      .then((preferences) => { if (!cancelled) setFavoriteDeckIds(preferences.favoriteDeckIds ?? []); })
      .catch(() => { if (!cancelled) setFavoriteDeckIds([]); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) return null;

  const favorite = Boolean(favoriteDeckIds?.includes(deckId));
  const atLimit = !favorite && (favoriteDeckIds?.length ?? 4) >= 4;
  const label = favorite ? 'Remove from favorites' : atLimit ? 'Favorite deck limit reached' : 'Add to favorites';
  const toggleFavorite = async () => {
    if (favoriteDeckIds === null || saving || atLimit) return;
    const enabled = !favorite;
    setSaving(true);
    try {
      await updateRiftboundProfilePreference({ action: 'favorite-deck', sourceId: deckId, enabled }, session);
      setFavoriteDeckIds(enabled ? [...favoriteDeckIds, deckId] : favoriteDeckIds.filter((id) => id !== deckId));
    } catch {
      // Keep the current preference visible when the request fails.
    } finally {
      setSaving(false);
    }
  };

  return <button type="button" onClick={() => void toggleFavorite()} disabled={favoriteDeckIds === null || saving || atLimit} aria-label={label} title={label} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-70 ${favorite ? 'border-amber-200/60 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-amber-200/50 hover:text-amber-200'}`}>{saving || favoriteDeckIds === null ? <LoaderCircle size={15} className="animate-spin" /> : <Star size={15} className={favorite ? 'fill-current' : ''} />}</button>;
}

function RiftboundDeckListRow({ card, onOpen, highlighted = false }: { card: RiftboundCard; onOpen: (card: RiftboundCard) => void; highlighted?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(card)} className={`w-full max-w-[18rem] justify-self-center min-w-0 rounded-xl border px-3 py-2 text-left transition hover:border-amber-200/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 ${highlighted ? 'border-amber-300/90 bg-amber-300/5' : 'border-white/10 bg-slate-900/60'}`}>
      <span className={`truncate text-sm font-bold ${getRiftboundCardDomainTextClass(card)}`}>{card.displayName}</span>
      <span className="mt-1 block truncate text-xs font-black uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
    </button>
  );
}

function collapseRiftboundDeckEntries(entries: Array<{ card: RiftboundCard }>) {
  const collapsed = new Map<string, { card: RiftboundCard; quantity: number }>();
  entries.forEach(({ card }) => {
    const current = collapsed.get(card.id);
    collapsed.set(card.id, current ? { ...current, quantity: current.quantity + 1 } : { card, quantity: 1 });
  });
  return Array.from(collapsed.values());
}

function RiftboundDeckEntries({ entries, listView, onOpen, gridClassName = 'riftbound-card-grid', highlightCardId }: { entries: ExpandedRiftboundDeckCard[]; listView: boolean; onOpen: (card: RiftboundCard) => void; gridClassName?: string; highlightCardId?: string }) {
  if (entries.length === 0) return null;
  if (listView) {
    const listGridClassName = gridClassName === 'riftbound-card-grid'
      ? 'riftbound-deck-list-grid'
      : gridClassName.replace('gap-4', 'gap-2');
    return <div className={listGridClassName}>{entries.map(({ card, key }) => <RiftboundDeckListRow key={key} card={card} onOpen={onOpen} highlighted={card.id === highlightCardId} />)}</div>;
  }
  const cardGridClassName = gridClassName === 'riftbound-card-grid' ? 'riftbound-deck-card-grid' : gridClassName;
  return <div className={cardGridClassName}>{entries.map(({ card, category, key }) => <RiftboundCardRow key={key} card={card} normalQuantity={0} foilQuantity={0} mode="set-view" pendingChange={false} pending={false} onOpen={onOpen} highlighted={card.id === highlightCardId} domainNameColored showDeckMetadata landscapeImage={category === 'battlefields'} className="w-full max-w-[18rem]" />)}</div>;
}

export const RiftboundCardRow = memo(function RiftboundCardRow({
  card,
  normalQuantity,
  foilQuantity,
  mode = 'inventory',
  setQuantity = 0,
  ownership,
  pendingChange,
  pending,
  onOpen,
  onAdjust,
  onSetAdjust,
  highlighted = false,
  domainNameColored = false,
  showDeckMetadata = false,
  landscapeImage = false,
  className = '',
}: {
  card: RiftboundCard;
  normalQuantity: number;
  foilQuantity: number;
  mode?: 'inventory' | 'set-selection' | 'set-view' | 'collection-view';
  setQuantity?: number;
  ownership?: 'owned' | 'missing';
  pendingChange: boolean;
  pending: boolean;
  onOpen?: (card: RiftboundCard) => void;
  onAdjust?: (card: RiftboundCard, finish: InventoryItem['finish'], delta: 1 | -1) => void;
  onSetAdjust?: (card: RiftboundCard, delta: 1 | -1) => void;
  highlighted?: boolean;
  domainNameColored?: boolean;
  showDeckMetadata?: boolean;
  landscapeImage?: boolean;
  className?: string;
}) {
  const finishOptions = getCardFinishOptions(card);
  const isSelection = mode === 'set-selection';
  const isInventory = mode === 'inventory';
  const isCollection = mode === 'collection-view';
  return (
    <article className={`riftbound-card-item flex min-w-0 flex-col rounded-2xl border bg-slate-950/80 p-3 transition-colors hover:bg-slate-950 sm:p-4 ${highlighted ? 'border-amber-300/90 bg-amber-300/5' : pendingChange || (isSelection && setQuantity > 0) ? 'border-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.12)]' : ownership === 'owned' ? 'border-emerald-300/70 shadow-[0_0_18px_rgba(52,211,153,0.1)]' : ownership === 'missing' ? 'border-red-300/50 shadow-[0_0_18px_rgba(248,113,113,0.08)]' : 'border-white/10 hover:border-white/20'} ${className}`}>
      {ownership ? <div className={`mb-2 inline-flex items-center gap-1 self-end text-[0.6rem] font-black uppercase tracking-[0.12em] ${ownership === 'owned' ? 'text-emerald-300' : 'text-red-300'}`}><CheckCircle2 size={12} /> {ownership}</div> : null}
      <button
        type="button"
        onClick={() => onOpen?.(card)}
        disabled={!onOpen}
        className="flex min-w-0 flex-1 flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <span className={`relative order-2 mt-3 w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 ${landscapeImage ? 'aspect-[1038/744] max-w-[16rem]' : 'aspect-[744/1039] max-w-[11rem]'}`}>
          <RiftboundCardImage card={card} sizes="176px" orientation={landscapeImage ? 'landscape' : 'portrait'} className="object-cover" loading="lazy" />
        </span>
        <span className="order-1 min-w-0 w-full">
          <span className={`block truncate text-lg font-black tracking-tight ${domainNameColored ? getRiftboundCardDomainTextClass(card) : 'text-white'}`} title={card.displayName}>{card.displayName}</span>
          <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
        </span>
      </button>

      {showDeckMetadata && getRiftboundDeckTypeLabel(card) ? <span className="mt-2 self-end text-[0.6rem] font-black uppercase tracking-[0.1em] text-slate-500">{getRiftboundDeckTypeLabel(card)}</span> : null}

      {isInventory ? (
      <div className={`mt-3 grid shrink-0 gap-2 ${finishOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {finishOptions.map((finish) => (
          <div key={finish} className="flex min-w-0 flex-col items-center gap-1">
            <FinishInventoryControls
              card={card}
              finish={finish}
              quantity={finish === 'foil' ? foilQuantity : normalQuantity}
              pending={pending}
              onAdjust={(nextFinish, delta) => onAdjust?.(card, nextFinish, delta)}
            />
            <span className={`whitespace-nowrap text-[0.65rem] font-semibold ${finish === 'foil' ? 'text-amber-200/80' : 'text-slate-500'}`}>
              {getFinishLabel(finish)} {formatMarketPriceOrUnavailable(getMarketPriceForFinish(card, finish))}
            </span>
          </div>
        ))}
      </div>
      ) : isSelection ? (
        <div className="mt-3 shrink-0">
          <SetCardControls card={card} quantity={setQuantity} onAdjust={(delta) => onSetAdjust?.(card, delta)} />
        </div>
      ) : isCollection ? (
        <div className="mt-3 flex min-h-8 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-2 py-1.5">
          {finishOptions.map((finish) => (
            <span key={finish} className={`whitespace-nowrap text-[0.65rem] font-semibold ${finish === 'foil' ? 'text-amber-200/80' : 'text-slate-400'}`}>
              <span className="font-black text-white">{finish === 'foil' ? foilQuantity : normalQuantity}</span> {getFinishLabel(finish)}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
});

export function RiftboundCardDetailsModal({
  card,
  normalQuantity,
  foilQuantity,
  latestSnapshotDate,
  pending,
  showInventoryControls = true,
  showMarketDetails = true,
  actions,
  preferenceSession,
  onPreferenceChange,
  onClose,
  onAdjust,
}: {
  card: RiftboundCard;
  normalQuantity: number;
  foilQuantity: number;
  latestSnapshotDate: string | null;
  pending: boolean;
  showInventoryControls?: boolean;
  showMarketDetails?: boolean;
  actions?: ReactNode;
  preferenceSession?: Session | null;
  onPreferenceChange?: (change: { favorite: boolean; wishlist: boolean }) => void;
  onClose: () => void;
  onAdjust: (card: RiftboundCard, finish: InventoryItem['finish'], delta: 1 | -1) => void;
}) {
  const rarityClassName = rarityStyles[card.rarity] ?? 'text-slate-300';
  const finishOptions = getCardFinishOptions(card);
  const [priceHistory, setPriceHistory] = useState<RiftboundPriceHistoryEntry[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(true);
  const [priceHistoryError, setPriceHistoryError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPriceHistory([]);
    setPriceHistoryError('');
    setPriceHistoryLoading(showMarketDetails);

    if (!showMarketDetails) {
      return () => {
        cancelled = true;
      };
    }

    void loadPriceHistory(card.id, latestSnapshotDate)
      .then((history) => {
        if (!cancelled) setPriceHistory(history);
      })
      .catch((error: unknown) => {
        if (!cancelled) setPriceHistoryError(error instanceof Error ? error.message : 'Unable to load market value history.');
      })
      .finally(() => {
        if (!cancelled) setPriceHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [card.id, latestSnapshotDate, showMarketDetails]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${card.displayName} details`}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 sm:max-h-[calc(100dvh-2rem)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close card details"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          <X size={18} />
        </button>
        {showInventoryControls ? (
          <div className="absolute right-3 top-16 z-10 flex max-w-[calc(100%-4.5rem)] flex-wrap justify-end gap-2 sm:right-20 sm:top-4 sm:max-w-none sm:flex-nowrap">
            {finishOptions.map((finish) => (
              <FinishInventoryControls
                key={finish}
                card={card}
                finish={finish}
                quantity={finish === 'foil' ? foilQuantity : normalQuantity}
                pending={pending}
                onAdjust={(nextFinish, delta) => onAdjust(card, nextFinish, delta)}
              />
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 p-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-7">
          <div className="grid content-start justify-items-center gap-3">
            <a href={card.sourceUrl} target="_blank" rel="noreferrer" aria-label={`View official card for ${card.displayName}`} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-200">
              <div className="relative aspect-[744/1039] w-56 overflow-hidden rounded-2xl bg-slate-900">
                <RiftboundCardImage card={card} sizes="224px" className="object-cover" />
              </div>
            </a>
            <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-center text-xs font-black uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">
              View Official Card
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="grid min-w-0 gap-5">
            <div className="min-w-0 pr-4 sm:pr-44">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{card.setName} · {card.setCode} {card.numberLabel}</p>
                <div className="mt-2 flex flex-wrap items-center justify-start gap-2"><h2 className="min-w-0 text-3xl font-black tracking-tight text-white">{card.displayName}</h2>{preferenceSession ? <RiftboundCardPreferenceActions cardId={card.id} session={preferenceSession} onChange={onPreferenceChange} /> : null}</div>
                <p className={`mt-2 text-sm font-black ${rarityClassName}`}>{card.rarity}</p>
                {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
              </div>
            </div>
            {showMarketDetails ? <div className="grid gap-3 sm:grid-cols-2">
              {(['normal', 'foil'] as const).map((finish) => {
                const price = getMarketPriceForFinish(card, finish);
                return (
                  <div key={finish} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{finish} market value</p>
                      <MarketValueSourceInfo />
                    </div>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{formatMarketPriceOrUnavailable(price)}</p>
                    <p className="mt-2 text-xs text-slate-500">{getMarketPriceUpdatedAt(card) ? 'Latest daily snapshot' : 'No price available'}</p>
                    <MarketValueRefreshNote />
                  </div>
                );
              })}
            </div> : null}

            <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-3">
              <DetailValue label="Number" value={`${card.setCode} ${card.numberLabel}`} />
              <DetailValue label="Tag" value={card.tags.join('; ') || 'N/A'} />
              <DetailValue label="Energy" value={String(card.energyCost)} />
              <DetailValue label="Card Type" value={card.cardTypeLabels.join('; ')} />
              <DetailValue label="Finish Options" value={card.finishOptions.join('; ')} />
              <DetailValue label="Power" value={String(card.powerCost)} />
              <DomainDetailValue domains={card.domains} />
              <DetailValue label="Artist" value={card.artist || 'N/A'} />
              <DetailValue label="Might" value={String(card.might)} />
            </dl>

            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Product Details</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{card.productDetails}</p>
            </div>

            {showMarketDetails ? <div className="border-t border-white/10 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Value History</p>
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-600">Last 30 days</span>
              </div>
              <div className="mt-3">
                {priceHistoryLoading ? (
                  <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">Loading market history...</p>
                ) : priceHistoryError ? (
                  <p className="rounded-2xl border border-red-300/10 bg-red-950/20 px-4 py-5 text-sm text-red-200">{priceHistoryError}</p>
                ) : (
                  <RiftboundPriceHistoryChart history={priceHistory} />
                )}
              </div>
            </div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RiftboundCollectionValueHistoryModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [history, setHistory] = useState<RiftboundCollectionValueHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadCollectionValueHistory(session.user.id, session.access_token)
      .then((nextHistory) => {
        if (!cancelled) setHistory(nextHistory);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(nextError instanceof Error ? nextError.message : 'Unable to load collection value history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session.access_token, session.user.id]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Collection value history"
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-7"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close collection value history"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          <X size={18} />
        </button>
        <div className="pr-14">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection history</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Market value over the past year</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">This view uses your saved inventory and daily captured market prices. Update your inventory first if you have pending changes.</p>
        </div>
        <div className="mt-6">
          {loading ? (
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-400"><LoaderCircle size={17} className="animate-spin" /> Loading collection history...</div>
          ) : error ? (
            <p className="rounded-2xl border border-red-300/10 bg-red-950/20 px-4 py-5 text-sm text-red-200">{error}</p>
          ) : (
            <RiftboundCollectionValueHistoryChart history={history} />
          )}
        </div>
      </div>
    </div>
  );
}

function getShareCreatorName(currentSession: Session | null) {
  const metadata = currentSession?.user.user_metadata;
  const username = metadata && typeof metadata.username === 'string' ? metadata.username.trim() : '';
  if (username) return username;

  const displayName = metadata && typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '';
  if (displayName) return displayName;

  const emailName = currentSession?.user.email?.split('@')[0]?.trim() || '';
  return emailName || 'KnowLeague user';
}

function RiftboundCollectionShareModal({ rows, kind = 'collection', title, metadata, deck, onClose, onImport, onExportJson }: { rows: InventoryItem[]; kind?: CollectionShareKind; title?: string; metadata: CollectionShareMetadata; deck?: RiftboundDeck | null; onClose: () => void; onImport?: (file: File) => Promise<void>; onExportJson?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareUrlLoading, setShareUrlLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const compactUrl = kind === 'deck' && deck ? getCompactDeckShareUrl(deck, metadata) : getCompactCollectionShareUrl(rows, kind, title, metadata);
    setShareUrl(compactUrl);
    setShareUrlLoading(false);
    setCopied(false);
    const shareUrlPromise = kind === 'deck' && deck ? Promise.resolve(compactUrl) : getCollectionShareUrl(rows, kind, title, metadata);
    void shareUrlPromise
      .then((url) => {
        if (!cancelled) setShareUrl(url);
      })

    return () => {
      cancelled = true;
    };
  }, [deck, kind, metadata, rows, title]);

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const openPrintView = () => {
    if (!shareUrl) return;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImport) return;

    setImporting(true);
    setImportError('');
    try {
      await onImport(file);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to import this collection JSON file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${kind === 'collection' ? 'Export or import collection' : `Share, export, or import ${kind}`}`} className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-7" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close share collection dialog" onClick={onClose} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={18} /></button>
        <div className="pr-14">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{kind === 'collection' ? 'Collection tools' : `${kind} tools`}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{kind === 'collection' ? 'Export / Import your collection' : kind === 'deck' ? 'Share / Export this game deck' : 'Share / Export this set'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">The share link is a read-only snapshot. Anyone with the link can see the cards and quantities included in it.</p>
        </div>
        <div className="mt-6 grid gap-3">
          {shareUrlLoading ? <p className="text-center text-xs font-semibold text-slate-500">Preparing compact share link...</p> : null}
          <button type="button" onClick={() => void copyShareUrl()} disabled={!shareUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/50 bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-60">
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
          <button type="button" onClick={openPrintView} disabled={!shareUrl} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-60">
            <FileDown size={17} />
            Open print / Save as PDF view
          </button>
          <button type="button" onClick={() => kind === 'collection' ? downloadCollectionJson(rows) : kind === 'set' ? downloadSetJson(rows, title) : onExportJson?.()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200">
            <FileDown size={17} />
            {kind === 'collection' ? 'Export collection JSON' : kind === 'set' ? 'Export set JSON' : 'Export game deck JSON'}
          </button>
          {kind === 'collection' ? (
            <>
              <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleImport(event)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={importing} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-60">
                {importing ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
                {importing ? 'Importing collection...' : 'Import collection JSON'}
              </button>
              {importError ? <p className="text-sm font-semibold text-red-200">{importError}</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type RiftboundOcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence?: number } }>;
  setParameters: (parameters: { tessedit_pageseg_mode: Tesseract.PSM; preserve_interword_spaces?: string; user_defined_dpi?: string }) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

type RiftboundPendingScan = {
  card: RiftboundCard;
  finish: InventoryItem['finish'];
  quantity: number;
};

function RiftboundCardScannerModal({ cards, accessToken, onClose, onAdd }: { cards: RiftboundCard[]; accessToken: string; onClose: () => void; onAdd: (card: RiftboundCard, finish: InventoryItem['finish'], quantity: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameCanvasRef = useRef<HTMLCanvasElement>(null);
  const footerCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<RiftboundOcrWorker | null>(null);
  const scanInProgressRef = useRef(false);
  const visionUnavailableRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [alwaysRequireConfirmation, setAlwaysRequireConfirmation] = useState(false);
  const [pendingScans, setPendingScans] = useState<RiftboundPendingScan[]>([]);
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState('');
  const [lowConfidenceMatch, setLowConfidenceMatch] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<RiftboundScanMatch | null>(null);
  const [visionStatus, setVisionStatus] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle');
  const [visionError, setVisionError] = useState('');
  const [selectedFinish, setSelectedFinish] = useState<InventoryItem['finish']>('normal');
  const [preferredFinish, setPreferredFinish] = useState<InventoryItem['finish']>('normal');
  const [quantity, setQuantity] = useState(1);
  const [addedMessage, setAddedMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const videoElement = videoRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser or requires HTTPS.');
      return undefined;
    }

    void navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoElement) {
        videoElement.srcObject = stream;
        void videoElement.play().catch(() => undefined);
      }
      setCameraReady(true);
      setCameraError('');
    }).catch((error: unknown) => {
      if (!cancelled) setCameraError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : 'No camera detected.');
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoElement) videoElement.srcObject = null;
    };
  }, [cameraAttempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;

    if (pendingMenuOpen) {
      video.pause();
      streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = false; });
      return;
    }

    streamRef.current?.getVideoTracks().forEach((track) => { track.enabled = true; });
    void video.play().catch(() => undefined);
  }, [cameraReady, pendingMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    void import('tesseract.js')
      .then(({ createWorker }) => createWorker('eng', 1, {
        logger: (message) => setScanProgress(Math.round((message.progress ?? 0) * 100)),
      }))
      .then((worker) => {
        if (cancelled) {
          void worker.terminate();
          return;
        }
        workerRef.current = worker;
        setWorkerReady(true);
        setWorkerError('');
      })
      .catch((error: unknown) => {
        if (!cancelled) setWorkerError(error instanceof Error ? error.message : 'Unable to prepare the local card reader.');
      });

    return () => {
      cancelled = true;
      if (workerRef.current) void workerRef.current.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, []);

  useEffect(() => {
    if (!selectedMatch) return;
    const options = getCardFinishOptions(selectedMatch.card);
    setSelectedFinish(options.includes(preferredFinish)
      ? preferredFinish
      : options.includes(selectedMatch.card.defaultFinish) ? selectedMatch.card.defaultFinish : options[0]);
  }, [preferredFinish, selectedMatch]);

  const addPendingScan = useCallback((card: RiftboundCard, finish: InventoryItem['finish'], amount: number) => {
    if (amount <= 0) return;
    setPendingScans((current) => {
      const existingIndex = current.findIndex((entry) => entry.card.id === card.id && entry.finish === finish);
      if (existingIndex < 0) return [...current, { card, finish, quantity: amount }];
      return current.map((entry, index) => index === existingIndex ? { ...entry, quantity: entry.quantity + amount } : entry);
    });
    setAddedMessage(`${amount} ${getFinishLabel(finish).toLowerCase()} ${card.displayName} ${amount === 1 ? 'copy' : 'copies'} added to pending scans.`);
  }, []);

  const adjustPendingScan = (index: number, delta: 1 | -1) => {
    setPendingScans((current) => current.flatMap((entry, entryIndex) => {
      if (entryIndex !== index) return [entry];
      return [{ ...entry, quantity: Math.max(0, entry.quantity + delta) }];
    }));
  };

  const confirmPendingScans = () => {
    const scansToConfirm = pendingScans.filter((entry) => entry.quantity > 0);
    if (scansToConfirm.length === 0) return;
    scansToConfirm.forEach((entry) => onAdd(entry.card, entry.finish, entry.quantity));
    const totalCopies = scansToConfirm.reduce((total, entry) => total + entry.quantity, 0);
    setPendingScans([]);
    setPendingMenuOpen(false);
    setAddedMessage(`${totalCopies} ${totalCopies === 1 ? 'card' : 'cards'} added to your pending inventory changes.`);
  };

  const scanCard = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const nameCanvas = nameCanvasRef.current;
    const footerCanvas = footerCanvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !nameCanvas || !footerCanvas || !worker || !cameraReady || scanInProgressRef.current) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setScanError('The camera is not ready yet. Try again in a moment.');
      return;
    }

    if (!drawRiftboundScanFrame(video, canvas)) {
      setScanError('Unable to capture an image from the camera.');
      return;
    }

    scanInProgressRef.current = true;
    setScanning(true);
    setScanProgress(0);
    setScanError('');
    setLowConfidenceMatch(false);
    setVisionStatus('idle');
    setVisionError('');
    setSelectedMatch(null);
    setAddedMessage('');

    try {
      if (!drawRiftboundScanRegion(canvas, nameCanvas, 0.48, 0.68) || !drawRiftboundScanRegion(canvas, footerCanvas, 0.9, 1)) {
        setScanError('Unable to prepare the card text regions.');
        return;
      }

      await worker.setParameters({ tessedit_pageseg_mode: RIFTBOUND_OCR_SINGLE_LINE_MODE, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const nameResult = await worker.recognize(nameCanvas);
      const footerResult = await worker.recognize(footerCanvas);
      let detectedText = [nameResult.data.text, footerResult.data.text].filter(Boolean).join('\n').trim();
      let localMatches = findRiftboundScanMatches(cards, detectedText);

      if ((localMatches[0]?.score ?? 0) < RIFTBOUND_SCAN_LOCAL_RETRY_THRESHOLD) {
        if (drawRiftboundScanRegion(canvas, nameCanvas, 0.48, 0.68, 'threshold') && drawRiftboundScanRegion(canvas, footerCanvas, 0.9, 1, 'threshold')) {
          const thresholdNameResult = await worker.recognize(nameCanvas);
          const thresholdFooterResult = await worker.recognize(footerCanvas);
          detectedText = [detectedText, thresholdNameResult.data.text, thresholdFooterResult.data.text].filter(Boolean).join('\n').trim();
          localMatches = findRiftboundScanMatches(cards, detectedText);
        }
      }

      if ((localMatches[0]?.score ?? 0) < RIFTBOUND_SCAN_LOCAL_RETRY_THRESHOLD) {
        await worker.setParameters({ tessedit_pageseg_mode: RIFTBOUND_OCR_SINGLE_BLOCK_MODE, preserve_interword_spaces: '1', user_defined_dpi: '300' });
        const fullResult = await worker.recognize(canvas);
        detectedText = [detectedText, fullResult.data.text].filter(Boolean).join('\n').trim();
        localMatches = findRiftboundScanMatches(cards, detectedText);
      }

      const localVisibleMatches = getVisibleRiftboundScanMatches(localMatches);
      let detectedMatches = localVisibleMatches;
      let visionText = '';
      const localConfidence = localMatches[0]?.score ?? 0;
      const shouldUseVisionFallback = !visionUnavailableRef.current
        && localConfidence < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD;

      if (shouldUseVisionFallback) {
        setVisionStatus('checking');
        try {
          visionText = await requestRiftboundVisionText(canvas, accessToken);
          const visionMatches = findRiftboundScanMatches(cards, visionText);
          const visionVisibleMatches = getVisibleRiftboundScanMatches(visionMatches);
          if (visionVisibleMatches.length > 0 && visionVisibleMatches[0].score >= (localVisibleMatches[0]?.score ?? 0)) {
            detectedMatches = visionVisibleMatches;
          }
          setVisionStatus('ready');
          setVisionError('');
        } catch (error: unknown) {
          setVisionStatus('unavailable');
          setVisionError(error instanceof Error ? error.message : 'Cloud card recognition is unavailable.');
          if (error instanceof Error && error.message.includes('not configured')) visionUnavailableRef.current = true;
        }
      }

      const bestMatch = detectedMatches[0] ?? null;
      const shouldAutoAdd = Boolean(bestMatch && bestMatch.score >= RIFTBOUND_SCAN_AUTO_ADD_THRESHOLD && !alwaysRequireConfirmation);
      setLowConfidenceMatch(!bestMatch || bestMatch.score < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD);
      setSelectedMatch(shouldAutoAdd ? null : bestMatch && bestMatch.score >= RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD ? bestMatch : null);
      if (shouldAutoAdd && bestMatch) {
        const finishOptions = getCardFinishOptions(bestMatch.card);
        const finish = finishOptions.includes(preferredFinish) ? preferredFinish : finishOptions[0];
        addPendingScan(bestMatch.card, finish, quantity);
        setAddedMessage(`${quantity} ${getFinishLabel(finish).toLowerCase()} ${bestMatch.card.displayName} ${quantity === 1 ? 'copy' : 'copies'} added automatically to pending scans.`);
      } else {
        setAddedMessage('');
      }
      if (detectedMatches.length === 0) setScanError('No confident match yet. Center the card inside the guide and reduce glare.');
      else if (detectedMatches[0].score < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD) setScanError('Low-confidence match. Keep the card flat, fill the guide, and reduce glare.');
    } catch (error: unknown) {
      setScanError(error instanceof Error ? error.message : 'Unable to read the card image.');
    } finally {
      scanInProgressRef.current = false;
      setScanning(false);
    }
  }, [accessToken, addPendingScan, alwaysRequireConfirmation, cameraReady, cards, preferredFinish, quantity]);

  useEffect(() => {
    const handleScannerKeyDown = (event: KeyboardEvent) => {
      if (pendingMenuOpen || scanning || !cameraReady || !workerReady || (event.key !== 'Enter' && event.key !== ' ')) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      void scanCard();
    };

    window.addEventListener('keydown', handleScannerKeyDown);
    return () => window.removeEventListener('keydown', handleScannerKeyDown);
  }, [cameraReady, pendingMenuOpen, scanCard, scanning, workerReady]);

  const addSelectedCard = () => {
    if (!selectedMatch || selectedMatch.score < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD) return;
    addPendingScan(selectedMatch.card, selectedFinish, quantity);
  };

  const pendingMarketValue = pendingScans.reduce(
    (total, entry) => total + (getMarketPriceForFinish(entry.card, entry.finish) ?? 0) * entry.quantity,
    0,
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Scan Riftbound cards" className="relative max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 sm:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close card scanner" onClick={onClose} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={18} /></button>
        <div className="pr-14">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound Card Scanner</p>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="grid gap-3">
            <div className={`relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border bg-slate-900 ${lowConfidenceMatch ? 'border-red-400/90' : 'border-white/10'}`}>
              <video ref={videoRef} muted playsInline autoPlay aria-label="Riftbound card camera preview" className="h-full w-full object-cover" />
              <div className={`pointer-events-none absolute inset-[10%] rounded-2xl border-2 ${lowConfidenceMatch ? 'border-red-400/90' : 'border-amber-300/80'}`} />
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"><span className="rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Fit card inside frame</span></div>
              {!cameraError ? <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"><span className="rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300" aria-live="polite">{workerReady ? 'Ready to scan' : `Preparing local reader${scanProgress > 0 ? ` · ${scanProgress}%` : '...'}`}</span></div> : null}
              {!cameraReady && !cameraError ? <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-sm font-semibold text-slate-300"><LoaderCircle size={18} className="mr-2 animate-spin" />Starting camera...</div> : null}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={nameCanvasRef} className="hidden" />
            <canvas ref={footerCanvasRef} className="hidden" />
            {cameraError ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3">
                <p className="text-sm font-semibold text-red-200">{cameraError}</p>
                <button type="button" onClick={() => { setCameraError(''); setCameraReady(false); setLowConfidenceMatch(false); setCameraAttempt((attempt) => attempt + 1); }} className="rounded-xl border border-red-200/30 bg-red-950/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-red-100 transition hover:border-red-100/60 hover:bg-red-950/50">Try again</button>
              </div>
            ) : null}
            {workerError ? <p className="rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-200">{workerError}</p> : null}
            <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-2">
              <button type="button" title="Can be activated with Space key and Enter key" aria-label="Scan now. Can be activated with Space key and Enter key" onClick={() => void scanCard()} disabled={!cameraReady || !workerReady || scanning} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/60 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-50">
                {scanning || !cameraReady || !workerReady ? <LoaderCircle size={17} className="animate-spin" /> : <Camera size={17} />}
                {scanning ? 'Scanning...' : !cameraReady ? 'Starting camera...' : !workerReady ? 'Preparing scanner...' : 'Scan now'}
              </button>
              <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-slate-950 p-1">
                <button type="button" aria-pressed={alwaysRequireConfirmation} title="Require Confirmation off will automatically add a high match card to the pending inventory" onClick={() => setAlwaysRequireConfirmation((enabled) => !enabled)} className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${alwaysRequireConfirmation ? 'border-amber-200/60 bg-amber-300/10 text-amber-200' : 'border-transparent text-slate-400 hover:border-white/25 hover:bg-slate-900 hover:text-white'}`}>
                  <Check size={15} />
                  {alwaysRequireConfirmation ? 'Require Confirmation: On' : 'Require Confirmation: Off'}
                  <span className="group relative inline-flex">
                    <Info size={13} aria-label="Require Confirmation help" />
                    <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[140] mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-200 group-hover:block group-focus-within:block">Require Confirmation off will automatically add a high match card to the pending inventory.</span>
                  </span>
                </button>
                <div className="grid min-w-[9rem] grid-cols-2 rounded-lg border border-white/10 bg-slate-900 p-0.5" aria-label="Preferred scan finish">
                  {(['normal', 'foil'] as const).map((finish) => (
                    <button key={finish} type="button" aria-pressed={preferredFinish === finish} disabled={alwaysRequireConfirmation} onClick={() => setPreferredFinish(finish)} className={`rounded-md px-2 py-2 text-[0.65rem] font-black uppercase tracking-[0.08em] transition ${preferredFinish === finish ? finish === 'foil' ? 'bg-gradient-to-br from-amber-200/80 via-white/60 to-violet-300/80 text-slate-950' : 'bg-amber-300 text-slate-950' : 'text-slate-500 hover:bg-slate-800 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}>{getFinishLabel(finish)}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid content-start gap-4">
            {scanError ? <p className="rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-200">{scanError}</p> : null}
            {addedMessage && !selectedMatch ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-950/20 px-4 py-3 text-sm font-semibold text-emerald-200">{addedMessage}</p> : null}
            {visionStatus === 'unavailable' && visionError ? <p className="rounded-2xl border border-orange-200/20 bg-orange-950/20 px-4 py-3 text-sm font-semibold text-orange-200">Cloud recognition is unavailable, so local recognition is being used: {visionError}</p> : null}
            {selectedMatch ? (
              <div className="grid gap-3 rounded-2xl border border-amber-200/30 bg-slate-900/70 p-4">
                <div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">{alwaysRequireConfirmation ? 'Detected card' : 'Selected card'}</p><p className="mt-1 text-lg font-black text-white">{selectedMatch.card.displayName}</p><p className="mt-1 text-xs font-semibold text-slate-500">{selectedMatch.card.setName} · {selectedMatch.card.setCode} {selectedMatch.card.numberLabel}</p></div>
                {!alwaysRequireConfirmation && (getCardFinishOptions(selectedMatch.card).length > 1 ? (
                  <div role="group" aria-label="Choose card finish" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-950 p-1">
                    {getCardFinishOptions(selectedMatch.card).map((finish) => <button key={finish} type="button" onClick={() => setSelectedFinish(finish)} aria-pressed={selectedFinish === finish} className={`rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${selectedFinish === finish ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{getFinishLabel(finish)}</button>)}
                  </div>
                ) : <p className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-center text-xs font-black uppercase tracking-[0.1em] text-slate-400">{getFinishLabel(getCardFinishOptions(selectedMatch.card)[0])}</p>)}
                <div className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Quantity</span>
                  <div className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-slate-950 px-2">
                    <button type="button" aria-label="Decrease scan quantity" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Minus size={15} /></button>
                    <span className="text-sm font-black text-white" aria-live="polite">{quantity}</span>
                    <button type="button" aria-label="Increase scan quantity" onClick={() => setQuantity((current) => Math.min(1000, current + 1))} disabled={quantity >= 1000} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} /></button>
                  </div>
                </div>
                {alwaysRequireConfirmation ? (
                  <div className={`grid gap-2 ${getCardFinishOptions(selectedMatch.card).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {getCardFinishOptions(selectedMatch.card).map((finish) => <button key={finish} type="button" onClick={() => addPendingScan(selectedMatch.card, finish, quantity)} className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition hover:brightness-110 ${finish === 'foil' ? 'border-amber-200/60 bg-gradient-to-br from-amber-200/80 via-white/60 to-violet-300/80 text-slate-950' : 'border-amber-200/50 bg-amber-300 text-slate-950'}`}>Add {getFinishLabel(finish)}</button>)}
                  </div>
                ) : <button type="button" onClick={addSelectedCard} disabled={selectedMatch.score < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Add to pending scans</button>}
                {selectedMatch.score < RIFTBOUND_SCAN_CONFIDENCE_THRESHOLD ? <p className="text-xs font-semibold leading-5 text-amber-200">Confidence is still low. Keep the card flat, fill the guide, and reduce glare before adding it.</p> : null}
                {addedMessage ? <p className="text-xs font-semibold leading-5 text-emerald-300">{addedMessage}</p> : null}
              </div>
            ) : null}
            <button type="button" onClick={() => setPendingMenuOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:border-amber-200/50 hover:text-amber-200"><PackageOpen size={17} /> View Pending Inventory ({pendingScans.reduce((total, entry) => total + entry.quantity, 0)})</button>
          </div>
        </div>
        {pendingMenuOpen ? (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.stopPropagation()}>
            <div role="dialog" aria-modal="true" aria-label="Pending scanned inventory" className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 sm:p-6">
              <button type="button" aria-label="Close pending inventory" onClick={() => setPendingMenuOpen(false)} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800"><X size={17} /></button>
              <div className="pr-12">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">Pending Inventory Scans</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <p className="text-sm font-black text-emerald-300">{formatMarketPrice(pendingMarketValue)} total value</p>
                </div>
              </div>
              {pendingScans.length > 0 ? (
                <div className="mt-5 grid gap-2">
                  {pendingScans.map((entry, index) => (
                    <article key={`${entry.card.id}:${entry.finish}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                      <div className="relative aspect-[744/1039] overflow-hidden rounded-lg bg-slate-950">
                        <RiftboundCardImage card={entry.card} sizes="56px" className="object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{entry.card.displayName}</p>
                        <div className="mt-1 flex min-w-0 flex-row-reverse items-center justify-between gap-2">
                          <span className="shrink-0 text-xs font-black text-emerald-300">{formatMarketPriceOrUnavailable(getMarketPriceForFinish(entry.card, entry.finish))}</span>
                          <p className={`truncate text-xs font-semibold ${entry.finish === 'foil' ? 'text-amber-200' : 'text-slate-500'}`}>{getFinishLabel(entry.finish)} · {entry.card.setCode} {entry.card.numberLabel}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950 p-1">
                        <button type="button" aria-label={`Decrease pending quantity for ${entry.card.displayName}`} onClick={() => adjustPendingScan(index, -1)} disabled={entry.quantity === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Minus size={14} /></button>
                        <span className="min-w-6 text-center text-sm font-black text-amber-200" aria-live="polite">{entry.quantity}</span>
                        <button type="button" aria-label={`Increase pending quantity for ${entry.card.displayName}`} onClick={() => adjustPendingScan(index, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"><Plus size={14} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="mt-5 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">No cards are pending from this scan session.</p>}
              <div className="mt-5 border-t border-white/10 pt-4">
                <button type="button" onClick={confirmPendingScans} disabled={!pendingScans.some((entry) => entry.quantity > 0)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"><Check size={17} /> Confirm and add to inventory</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RiftboundCardGrid() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseInventoryTab(searchParams.get('tab')) ?? 'global';
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<RiftboundSortMode>(defaultSortMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<RiftboundCardFilters>(emptyFilters);
  const [inventoryRows, setInventoryRows] = useState<InventoryItem[]>([]);
  const [savedInventoryRows, setSavedInventoryRows] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySaving, setInventorySaving] = useState(false);
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [selectedCardCanAdjustInventory, setSelectedCardCanAdjustInventory] = useState(true);
  const [selectedCardShowMarketDetails, setSelectedCardShowMarketDetails] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [collectionHistoryOpen, setCollectionHistoryOpen] = useState(false);
  const [collectionShareOpen, setCollectionShareOpen] = useState(false);
  const [collectionShareRows, setCollectionShareRows] = useState<InventoryItem[]>([]);
  const [collectionShareKind, setCollectionShareKind] = useState<CollectionShareKind>('collection');
  const [collectionShareTitle, setCollectionShareTitle] = useState('');
  const [collectionShareDeck, setCollectionShareDeck] = useState<RiftboundDeck | null>(null);
  const [collectionShareMetadata, setCollectionShareMetadata] = useState<CollectionShareMetadata>({ createdBy: 'KnowLeague user', createdAt: '' });
  const [sets, setSets] = useState<RiftboundSet[]>([]);
  const [decks, setDecks] = useState<RiftboundDeck[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState('');
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [setBuilderOpen, setSetBuilderOpen] = useState(false);
  const [setBuilderSource, setSetBuilderSource] = useState<SetSourceTab>('global');
  const [setBuilderName, setSetBuilderName] = useState('');
  const [setBuilderRows, setSetBuilderRows] = useState<Record<string, number>>({});
  const [setBuilderShowSelectedCards, setSetBuilderShowSelectedCards] = useState(false);
  const [setSaving, setSetSaving] = useState(false);
  const [setDeleting, setSetDeleting] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setOwnershipFilter, setSetOwnershipFilter] = useState<SetOwnershipFilter>('all');
  const [deckBuilderOpen, setDeckBuilderOpen] = useState(false);
  const [deckBuilderName, setDeckBuilderName] = useState('');
  const [deckBuilderDescription, setDeckBuilderDescription] = useState('');
  const [deckBuilderSource, setDeckBuilderSource] = useState<SetSourceTab>('global');
  const [deckBuilderCategory, setDeckBuilderCategory] = useState<RiftboundDeckCategory>('legend');
  const [deckBuilderRows, setDeckBuilderRows] = useState<DeckBuilderRows>(() => createEmptyDeckBuilderRows());
  const [deckBuilderShowSelectedCards, setDeckBuilderShowSelectedCards] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckDeleting, setDeckDeleting] = useState(false);
  const [decksError, setDecksError] = useState('');
  const setImportInputRef = useRef<HTMLInputElement>(null);
  const deckImportInputRef = useRef<HTMLInputElement>(null);
  const bootstrapLoadIdRef = useRef(0);
  const [deckViewMode, setDeckViewMode] = useState<RiftboundDeckViewMode>('compact');

  const setActiveTab = useCallback((nextTab: InventoryTab) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextTab === 'global') nextParams.delete('tab');
    else nextParams.set('tab', nextTab);
    const query = nextParams.toString();
    router.replace(query ? `/inventory?${query}` : '/inventory', { scroll: false });
  }, [router, searchParams]);
  const [latestPrices, setLatestPrices] = useState<Record<string, RiftboundLatestPrice>>({});
  const [latestSnapshotDate, setLatestSnapshotDate] = useState<string | null>(null);

  const openCardDetails = useCallback((card: RiftboundCard, canAdjustInventory = true, showMarketDetails = true) => {
    setSelectedCardCanAdjustInventory(canAdjustInventory);
    setSelectedCardShowMarketDetails(showMarketDetails);
    setSelectedCard(card);
  }, []);
  const openDeckCardDetails = useCallback((card: RiftboundCard) => openCardDetails(card, false, false), [openCardDetails]);

  const cards = useMemo(() => RIFTBOUND_CARDS.map((card) => {
    const latest = latestPrices[card.id];
    if (!latest) return card;

    return {
      ...card,
      marketPrice: latest.normal,
      marketPriceUpdatedAt: latest.updatedAt,
      marketPrices: {
        ...card.marketPrices,
        normal: latest.normal,
        foil: latest.foil,
        updatedAt: latest.updatedAt,
      },
    };
  }), [latestPrices]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  useEffect(() => {
    setSelectedCard((current) => {
      if (!current) return current;
      return cards.find((card) => card.id === current.id) ?? current;
    });
  }, [cards]);

  const loadRiftboundBootstrap = useCallback(async (nextSession: Session | null) => {
    const loadId = bootstrapLoadIdRef.current + 1;
    bootstrapLoadIdRef.current = loadId;
    const storageKey = nextSession ? getInventoryDraftStorageKey(nextSession.user.id) : null;
    const storedDraft = storageKey ? readStoredInventoryDraft(storageKey) : null;
    const hasStoredDraft = Boolean(storedDraft);

    setInventoryRows(storedDraft?.rows ?? []);
    setSavedInventoryRows(storedDraft?.savedRows ?? []);
    setInventoryLoading(Boolean(nextSession) && !hasStoredDraft);
    setSetsLoading(Boolean(nextSession));
    setInventoryError('');
    setSetsError('');

    try {
      const data = await getRiftboundBootstrap(nextSession);
      const savedRows = data.inventory?.items ?? [];
      const latestStoredDraft = storageKey ? readStoredInventoryDraft(storageKey) : null;

      if (bootstrapLoadIdRef.current !== loadId) return;

      setLatestPrices(data.prices ?? {});
      setLatestSnapshotDate(data.snapshotDate ?? null);
      setInventoryRows(latestStoredDraft?.rows ?? savedRows);
      setSavedInventoryRows(savedRows);
      setSets(data.sets?.sets ?? []);
      setDecks(data.decks?.decks ?? []);
    } catch (error) {
      if (bootstrapLoadIdRef.current !== loadId) return;
      const message = error instanceof Error ? error.message : 'Unable to load your Riftbound collection.';
      if (nextSession) {
        setInventoryError(message);
        setSetsError(message);
      }
      setInventoryRows(storedDraft?.rows ?? []);
      setSavedInventoryRows(storedDraft?.savedRows ?? []);
      setSets([]);
      setDecks([]);
    } finally {
      if (bootstrapLoadIdRef.current === loadId) {
        setInventoryLoading(false);
        setSetsLoading(false);
      }
    }
  }, []);

  useEffect(() => subscribeToAuthSession((nextSession) => {
    setSession(nextSession);
    void loadRiftboundBootstrap(nextSession);
  }), [loadRiftboundBootstrap]);

  const inventoryByCard = useMemo(() => {
    const quantities = new Map<string, number>();
    inventoryRows.forEach((row) => quantities.set(row.card_id, (quantities.get(row.card_id) ?? 0) + row.quantity));
    return quantities;
  }, [inventoryRows]);

  const savedInventoryByCard = useMemo(() => {
    const quantities = new Map<string, number>();
    savedInventoryRows.forEach((row) => quantities.set(row.card_id, (quantities.get(row.card_id) ?? 0) + row.quantity));
    return quantities;
  }, [savedInventoryRows]);

  const inventoryByFinish = useMemo(() => {
    const quantities = new Map<string, number>();
    inventoryRows.forEach((row) => quantities.set(getInventoryKey(row.card_id, row.finish), row.quantity));
    return quantities;
  }, [inventoryRows]);

  const savedInventoryByFinish = useMemo(() => {
    const quantities = new Map<string, number>();
    savedInventoryRows.forEach((row) => quantities.set(getInventoryKey(row.card_id, row.finish), row.quantity));
    return quantities;
  }, [savedInventoryRows]);

  const deferredQuery = useDeferredValue(query);
  const cardSearchIndex = useMemo(() => cards.map((card) => ({
    card,
    searchableText: normalizeSearchText([
      card.displayName,
      card.name,
      card.fullName,
      card.setCode,
      card.setName,
      card.numberLabel,
      card.rarity,
      card.cardType,
      card.cardTypeLabels.join(' '),
      card.tags.join(' '),
      card.domains.join(' '),
      card.productDetails,
      card.artist ?? '',
      String(card.energyCost),
      String(card.powerCost),
      String(card.might),
    ].join(' ')),
  })), [cards]);

  const filterOptionsByField = useMemo(() => {
    const setNames = new Map(cards.map((card) => [card.setCode, card.setName]));

    return {
    setCode: filterOptions(
      jumbledValues(uniqueSorted(cards.map((card) => card.setCode))),
      'All Sets',
      (setCode) => `${setCode} - ${setNames.get(setCode) ?? setCode}`,
    ),
    rarity: filterOptions(rarityOrder.filter((rarity) => cards.some((card) => card.rarity === rarity)), 'All Rarities'),
    cardType: filterOptions(jumbledValues(uniqueSorted(cards.map((card) => card.cardType))), 'All Card Types'),
    domain: filterOptions(
      ['Colorless', 'Body', 'Mind', 'Order', 'Chaos', 'Calm', 'Fury'].filter((domain) => cards.some((card) => card.domains.includes(domain))),
      'All Domains',
    ),
    energyCost: filterOptions(jumbledValues(uniqueSorted(cards.map((card) => String(card.energyCost)))), 'All Energy Costs'),
    powerCost: filterOptions(jumbledValues(uniqueSorted(cards.map((card) => String(card.powerCost)))), 'All Power Costs'),
    might: filterOptions(jumbledValues(uniqueSorted(cards.map((card) => String(card.might)))), 'All Might Values'),
    };
  }, [cards]);

  const filteredCards = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery);

    const matchingCards = cardSearchIndex.filter(({ card, searchableText }) => {
      const quantity = getCardQuantity(inventoryByCard, card.id);
      const savedQuantity = getCardQuantity(savedInventoryByCard, card.id);
    const inventoryOnly = activeTab === 'inventory'
      || (activeTab === 'sets' && setBuilderOpen && setBuilderSource === 'inventory')
      || (activeTab === 'sets' && deckBuilderOpen && deckBuilderSource === 'inventory');
      if (inventoryOnly && quantity === 0 && savedQuantity === 0) return false;
      if (!matchesFilter(filters.setCode, card.setCode)) return false;
      if (!matchesFilter(filters.rarity, card.rarity)) return false;
      if (!matchesFilter(filters.cardType, card.cardType)) return false;
      if (!matchesFilter(filters.domain, card.domains)) return false;
      if (!matchesFilter(filters.energyCost, String(card.energyCost))) return false;
      if (!matchesFilter(filters.powerCost, String(card.powerCost))) return false;
      if (!matchesFilter(filters.might, String(card.might))) return false;
      if (!matchesRiftboundPriceRange(card, filters.minPrice, filters.maxPrice)) return false;
      if (!normalizedQuery) return true;
      return searchableText.includes(normalizedQuery);
    }).map(({ card }) => card);

    return matchingCards.sort((left, right) => compareRiftboundCards(left, right, sortMode, inventoryByCard));
  }, [activeTab, cardSearchIndex, deckBuilderOpen, deckBuilderSource, deferredQuery, filters, inventoryByCard, savedInventoryByCard, setBuilderOpen, setBuilderSource, sortMode]);

  const ownedUniqueCount = inventoryByCard.size;
  const ownedCopyCount = useMemo(() => Array.from(inventoryByCard.values()).reduce((total, quantity) => total + quantity, 0), [inventoryByCard]);
  const unpricedCopyCount = useMemo(() => inventoryRows.reduce((total, row) => {
    const card = cardsById.get(row.card_id);
    return total + (card && getMarketPriceForFinish(card, row.finish) === null ? row.quantity : 0);
  }, 0), [cardsById, inventoryRows]);
  const savedMarketValue = useMemo(() => savedInventoryRows.reduce((total, row) => {
    const card = cardsById.get(row.card_id);
    return total + (card ? (getMarketPriceForFinish(card, row.finish) ?? 0) * row.quantity : 0);
  }, 0), [cardsById, savedInventoryRows]);
  const inventoryRarityCounts = useMemo(() => {
    const counts = new Map(inventoryRarityOrder.map((rarity) => [rarity, 0]));
    inventoryRows.forEach((row) => {
      const card = cardsById.get(row.card_id);
      if (card && counts.has(card.rarity)) {
        counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + row.quantity);
      }
    });
    return counts;
  }, [cardsById, inventoryRows]);
  const activeFilterCount = getRiftboundCardFilterCount(filters);
  const inventoryChanges = useMemo(
    () => getInventoryChanges(savedInventoryRows, inventoryRows),
    [inventoryRows, savedInventoryRows],
  );
  const pendingAddedMarketValue = useMemo(() => inventoryChanges.reduce((total, change) => {
    if (change.delta <= 0) return total;
    const card = cardsById.get(change.cardId);
    return total + (card ? (getMarketPriceForFinish(card, change.finish) ?? 0) * change.delta : 0);
  }, 0), [cardsById, inventoryChanges]);
  const filteredCardIds = useMemo(() => new Set(filteredCards.map((card) => card.id)), [filteredCards]);
  const inventoryFilterActive = activeTab === 'inventory'
    && Boolean(deferredQuery.trim() || activeFilterCount > 0);
  const filteredSavedMarketValue = useMemo(() => savedInventoryRows.reduce((total, row) => {
    if (!filteredCardIds.has(row.card_id)) return total;
    const card = cardsById.get(row.card_id);
    return total + (card ? (getMarketPriceForFinish(card, row.finish) ?? 0) * row.quantity : 0);
  }, 0), [cardsById, filteredCardIds, savedInventoryRows]);
  const filteredPendingAddedMarketValue = useMemo(() => inventoryChanges.reduce((total, change) => {
    if (change.delta <= 0 || !filteredCardIds.has(change.cardId)) return total;
    const card = cardsById.get(change.cardId);
    return total + (card ? (getMarketPriceForFinish(card, change.finish) ?? 0) * change.delta : 0);
  }, 0), [cardsById, filteredCardIds, inventoryChanges]);
  const displayedInventoryValue = inventoryFilterActive ? filteredSavedMarketValue : savedMarketValue;
  const displayedPendingAddedMarketValue = inventoryFilterActive ? filteredPendingAddedMarketValue : pendingAddedMarketValue;
  const hasUnsavedInventoryChanges = inventoryChanges.length > 0;
  const selectedSet = sets.find((set) => set.id === selectedSetId) ?? null;
  const selectedSetCards = selectedSet ? expandSetCards(selectedSet, cards) : [];
  const selectedSetCardsWithOwnership = selectedSetCards.map((entry) => ({
    ...entry,
    owned: getCardQuantity(inventoryByCard, entry.card.id) > entry.copyIndex,
  }));
  const displayedSetCards = selectedSetCardsWithOwnership.filter((entry) => setOwnershipFilter === 'all' || (setOwnershipFilter === 'owned' ? entry.owned : !entry.owned));
  const selectedSetRarityCounts = useMemo(() => {
    const counts = new Map(inventoryRarityOrder.map((rarity) => [rarity, 0]));
    selectedSet?.cards.forEach((entry) => {
      const card = cardsById.get(entry.card_id);
      if (card && counts.has(card.rarity)) counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + entry.quantity);
    });
    return counts;
  }, [cardsById, selectedSet]);
  const selectedSetValue = useMemo(() => selectedSet?.cards.reduce((total, entry) => {
    const card = cardsById.get(entry.card_id);
    return total + (card ? (getMarketPriceForFinish(card, card.defaultFinish) ?? 0) * entry.quantity : 0);
  }, 0) ?? 0, [cardsById, selectedSet]);
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const selectedDeckCards = selectedDeck ? expandRiftboundDeckCards(selectedDeck, cards) : [];
  const selectedDeckLegendCards = selectedDeckCards.filter(({ category }) => category === 'legend');
  const selectedDeckChampionCards = selectedDeckCards.filter(({ category, card }) => category === 'main' && isRiftboundChampionUnit(card));
  const selectedDeckMainCards = selectedDeckCards.filter(({ category, card }) => category === 'main' && !isRiftboundChampionUnit(card));
  const selectedDeckRuneCards = selectedDeckCards.filter(({ category }) => category === 'runes');
  const selectedDeckBattlefieldCards = selectedDeckCards.filter(({ category }) => category === 'battlefields');
  const selectedDeckSideboardCards = selectedDeckCards.filter(({ category }) => category === 'sideboard');
  const selectedDeckCompactShareUrl = useMemo(() => selectedDeck
    ? getCompactDeckShareUrl(selectedDeck, { createdBy: getShareCreatorName(session), createdAt: selectedDeck.created_at })
    : '', [selectedDeck, session]);
  const selectedSetCompactShareUrl = useMemo(() => selectedSet
    ? getCompactCollectionShareUrl(getSetShareRows(selectedSet), 'set', selectedSet.name, { createdBy: getShareCreatorName(session), createdAt: selectedSet.created_at })
    : '', [selectedSet, session]);
  const deckBuilderSelections = useMemo(() => flattenDeckBuilderRows(deckBuilderRows), [deckBuilderRows]);
  const deckBuilderLegendCardId = Object.keys(deckBuilderRows.legend)[0] ?? null;
  const deckBuilderChampionCardId = useMemo(() => getDeckBuilderChampionCardId(deckBuilderRows, cardsById), [cardsById, deckBuilderRows]);
  const deckBuilderTotals = useMemo(() => getRiftboundDeckTotals(deckBuilderSelections), [deckBuilderSelections]);
  const deckBuilderValidation = useMemo(() => validateRiftboundDeck({
    name: deckBuilderName,
    legendCardId: deckBuilderLegendCardId,
    chosenChampionCardId: deckBuilderChampionCardId,
    cards: deckBuilderSelections,
  }, cardsById), [cardsById, deckBuilderChampionCardId, deckBuilderLegendCardId, deckBuilderName, deckBuilderSelections]);
  const deckBuilderDescriptionError = deckBuilderDescription.length > 500 ? 'Deck descriptions must be 500 characters or fewer.' : '';
  const deckBuilderCards = useMemo(() => getDeckCategoryCards(filteredCards, deckBuilderCategory, deckBuilderRows, cardsById), [cardsById, deckBuilderCategory, deckBuilderRows, filteredCards]);
  const deckBuilderVisibleCards = useMemo(
    () => deckBuilderShowSelectedCards
      ? deckBuilderCards.filter((card) => (deckBuilderRows[deckBuilderCategory][card.id] ?? 0) > 0)
      : deckBuilderCards,
    [deckBuilderCards, deckBuilderCategory, deckBuilderRows, deckBuilderShowSelectedCards],
  );
  const setBuilderTotalCopies = useMemo(() => Object.values(setBuilderRows).reduce((total, quantity) => total + quantity, 0), [setBuilderRows]);
  const setBuilderVisibleCards = useMemo(
    () => setBuilderShowSelectedCards
      ? filteredCards.filter((card) => (setBuilderRows[card.id] ?? 0) > 0)
      : filteredCards,
    [filteredCards, setBuilderRows, setBuilderShowSelectedCards],
  );
  const availableSortOptions = activeTab === 'inventory'
    || (activeTab === 'sets' && setBuilderOpen && setBuilderSource === 'inventory')
    || (activeTab === 'sets' && deckBuilderOpen && deckBuilderSource === 'inventory')
    ? sortOptions
    : sortOptions.filter((option) => !option.value.startsWith('quantity-'));

  useEffect(() => {
    if (!session || inventoryLoading || inventoryError) return;

    const storageKey = getInventoryDraftStorageKey(session.user.id);
    if (hasUnsavedInventoryChanges) {
      persistInventoryDraft(storageKey, inventoryRows, savedInventoryRows);
    } else {
      clearInventoryDraft(storageKey);
    }
  }, [hasUnsavedInventoryChanges, inventoryError, inventoryLoading, inventoryRows, savedInventoryRows, session]);

  const adjustInventory = useCallback((card: RiftboundCard, finish: InventoryItem['finish'], delta: 1 | -1) => {
    if (!session) {
      setInventoryError('Sign in to track your Riftbound inventory.');
      setActiveTab('inventory');
      return;
    }

    setInventoryRows((rows) => updateInventoryRows(rows, card, finish, delta));
    setInventoryError('');
  }, [session, setActiveTab]);

  const addScannedCard = useCallback((card: RiftboundCard, finish: InventoryItem['finish'], quantity: number) => {
    if (!session) {
      setInventoryError('Sign in to track your Riftbound inventory.');
      setActiveTab('inventory');
      return;
    }

    setInventoryRows((rows) => addInventoryRows(rows, [{
      card_id: card.id,
      finish,
      quantity,
      updated_at: new Date().toISOString(),
    }]));
    setInventoryError('');
  }, [session, setActiveTab]);

  const saveInventory = async () => {
    if (!session) {
      setInventoryError('Sign in to track your Riftbound inventory.');
      setActiveTab('inventory');
      return;
    }

    if (!hasUnsavedInventoryChanges) return;

    setInventorySaving(true);
    setInventoryError('');
    try {
      const response = await fetch('/api/riftbound/inventory', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes: inventoryChanges }),
      });
      const data = await response.json() as InventoryMutationResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save your Riftbound inventory.');
      }

      const nextRows = data.items ?? [];
      clearInventoryDraft(getInventoryDraftStorageKey(session.user.id));
      invalidateRiftboundBootstrap(session);
      setInventoryRows(nextRows);
      setSavedInventoryRows(nextRows);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to save your Riftbound inventory.');
    } finally {
      setInventorySaving(false);
    }
  };

  const resetFilters = () => {
    setQuery('');
    setFilters(emptyFilters);
  };

  const clearPendingInventory = () => {
    if (inventorySaving) return;
    setInventoryRows(savedInventoryRows);
    setInventoryError('');
    if (session) clearInventoryDraft(getInventoryDraftStorageKey(session.user.id));
  };

  const toggleFilter = (field: RiftboundCategoricalFilterField, value: string) => {
    setFilters((current) => ({ ...current, [field]: toggleFilterValue(current[field], value) }));
  };

  const applyRarityFilter = (rarity: string) => {
    setActiveTab('inventory');
    setSetBuilderOpen(false);
    setFilters((current) => ({ ...current, rarity: toggleFilterValue(current.rarity, rarity) }));
  };

  const startDeckBuilder = () => {
    if (!session) {
      setDecksError('Sign in to create a Riftbound deck.');
      setActiveTab('sets');
      return;
    }

    setSelectedDeckId(null);
    setSelectedSetId(null);
    setDeckViewMode('compact');
    setEditingDeckId(null);
    setDeckBuilderOpen(true);
    setDeckBuilderName('');
    setDeckBuilderDescription('');
    setDeckBuilderSource('global');
    setDeckBuilderCategory('legend');
    setDeckBuilderRows(createEmptyDeckBuilderRows());
    setDeckBuilderShowSelectedCards(false);
    setDecksError('');
    resetFilters();
  };

  const editDeck = (deck: RiftboundDeck) => {
    setSelectedDeckId(null);
    setSelectedSetId(null);
    setDeckViewMode('compact');
    setEditingDeckId(deck.id);
    setDeckBuilderOpen(true);
    setDeckBuilderName(deck.name);
    setDeckBuilderDescription(deck.description ?? '');
    setDeckBuilderSource('global');
    setDeckBuilderCategory('legend');
    setDeckBuilderRows(getDeckBuilderRows(deck));
    setDeckBuilderShowSelectedCards(false);
    setDecksError('');
    resetFilters();
  };

  const adjustDeckCard = useCallback((card: RiftboundCard, delta: 1 | -1) => {
    setDeckBuilderRows((rows) => updateDeckBuilderRows(rows, deckBuilderCategory, card, delta, cardsById));
  }, [cardsById, deckBuilderCategory]);

  const createDeck = async () => {
    if (!session) {
      setDecksError('Sign in to create a Riftbound deck.');
      return;
    }
    if (deckBuilderDescriptionError) {
      setDecksError(deckBuilderDescriptionError);
      return;
    }
    if (!deckBuilderValidation.isValid) {
      setDecksError(deckBuilderValidation.errors[0] ?? 'Complete the deck checklist before saving.');
      return;
    }

    setDeckSaving(true);
    setDecksError('');
    try {
      const response = await fetch('/api/riftbound/decks', {
        method: editingDeckId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deckId: editingDeckId ?? undefined,
          name: deckBuilderName.trim(),
          description: deckBuilderDescription.trim(),
          legendCardId: deckBuilderLegendCardId,
          chosenChampionCardId: deckBuilderChampionCardId,
          cards: deckBuilderSelections,
        }),
      });
      const data = await response.json() as DeckMutationResponse;
      if (!response.ok || !data.deck) throw new Error(data.error || 'Unable to save Riftbound deck.');

      setDecks((current) => editingDeckId
        ? current.map((deck) => deck.id === editingDeckId ? data.deck as RiftboundDeck : deck)
        : [...current, data.deck as RiftboundDeck]);
      invalidateRiftboundBootstrap(session);
      setSelectedDeckId(data.deck.id);
      setDeckBuilderOpen(false);
      setDeckBuilderRows(createEmptyDeckBuilderRows());
      setDeckBuilderName('');
      setDeckBuilderDescription('');
      setEditingDeckId(null);
    } catch (error) {
      setDecksError(error instanceof Error ? error.message : 'Unable to save Riftbound deck.');
    } finally {
      setDeckSaving(false);
    }
  };

  const deleteDeck = async (deck: RiftboundDeck) => {
    if (!session || deckDeleting) return;
    if (!window.confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;

    setDeckDeleting(true);
    setDecksError('');
    try {
      const response = await fetch('/api/riftbound/decks', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deckId: deck.id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to delete this deck.');
      invalidateRiftboundBootstrap(session);
      setDecks((current) => current.filter((candidate) => candidate.id !== deck.id));
      setSelectedDeckId(null);
    } catch (error) {
      setDecksError(error instanceof Error ? error.message : 'Unable to delete this deck.');
    } finally {
      setDeckDeleting(false);
    }
  };

  const startSetBuilder = () => {
    if (!session) {
      setSetsError('Sign in to create a Riftbound set.');
      setActiveTab('sets');
      return;
    }
    if (sets.length >= 6) {
      setSetsError('You can create up to 6 Riftbound sets.');
      return;
    }
    setSelectedSetId(null);
    setEditingSetId(null);
    setSetBuilderOpen(true);
    setSetBuilderSource('global');
    setSetBuilderName('');
    setSetBuilderRows({});
    setSetBuilderShowSelectedCards(false);
    setSetsError('');
    resetFilters();
  };

  const editSet = (set: RiftboundSet) => {
    setSelectedSetId(null);
    setEditingSetId(set.id);
    setSetBuilderOpen(true);
    setSetBuilderSource('global');
    setSetBuilderName(set.name);
    setSetBuilderRows(Object.fromEntries(set.cards.map((card) => [card.card_id, card.quantity])));
    setSetBuilderShowSelectedCards(false);
    setSetsError('');
    resetFilters();
  };

  const openCollectionShare = (rows: InventoryItem[], kind: CollectionShareKind = 'collection', title = '') => {
    setCollectionShareRows(rows);
    setCollectionShareKind(kind);
    setCollectionShareTitle(title);
    setCollectionShareDeck(null);
    setCollectionShareMetadata({ createdBy: getShareCreatorName(session), createdAt: new Date().toISOString() });
    setCollectionShareOpen(true);
  };

  const openDeckShare = (deck: RiftboundDeck) => {
    setCollectionShareRows(getDeckShareRows(deck));
    setCollectionShareKind('deck');
    setCollectionShareTitle(deck.name);
    setCollectionShareDeck(deck);
    setCollectionShareMetadata({ createdBy: getShareCreatorName(session), createdAt: new Date().toISOString() });
    setCollectionShareOpen(true);
  };

  const importCollectionJson = async (file: File) => {
    if (!session) throw new Error('Sign in to import a collection into your inventory.');

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(await file.text()) as unknown;
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    const additions = parseCollectionJson(parsedValue);
    setInventoryRows((rows) => addInventoryRows(rows, additions));
    setInventoryError('');
    setActiveTab('inventory');
    setCollectionShareOpen(false);
  };

  const importSetJson = async (file: File) => {
    if (!session) throw new Error('Sign in to import a set.');
    if (sets.length >= 6) throw new Error('You can create up to 6 Riftbound sets.');

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(await file.text()) as unknown;
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    const importedSet = parseSetJson(parsedValue);
    const response = await fetch('/api/riftbound/sets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: importedSet.name,
        cards: importedSet.cards.map((card) => ({ cardId: card.card_id, quantity: card.quantity })),
      }),
    });
    const data = await response.json() as SetMutationResponse;
    if (!response.ok || !data.set) throw new Error(data.error || 'Unable to import this set.');

    setSets((current) => [...current, data.set as RiftboundSet]);
    invalidateRiftboundBootstrap(session);
    setSelectedSetId(data.set.id);
    setSetOwnershipFilter('all');
    setActiveTab('sets');
    setSetsError('');
    setCollectionShareOpen(false);
  };

  const importDeckJson = async (file: File) => {
    if (!session) throw new Error('Sign in to import a Riftbound game deck.');

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(await file.text()) as unknown;
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }

    const importedDeck = parseDeckJson(parsedValue);
    const response = await fetch('/api/riftbound/decks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: importedDeck.name,
        description: importedDeck.description,
        legendCardId: importedDeck.legendCardId,
        chosenChampionCardId: importedDeck.chosenChampionCardId || undefined,
        cards: importedDeck.cards,
      }),
    });
    const data = await response.json() as DeckMutationResponse;
    if (!response.ok || !data.deck) throw new Error(data.error || 'Unable to import this game deck.');

    setDecks((current) => [...current, data.deck as RiftboundDeck]);
    invalidateRiftboundBootstrap(session);
    setSelectedDeckId(data.deck.id);
    setSelectedSetId(null);
    setDeckViewMode('compact');
    setActiveTab('sets');
    setDecksError('');
  };

  const deleteSet = async (set: RiftboundSet) => {
    if (!session || setDeleting) return;
    if (!window.confirm(`Delete "${set.name}"? This cannot be undone.`)) return;

    setSetDeleting(true);
    setSetsError('');
    try {
      const response = await fetch('/api/riftbound/sets', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setId: set.id }),
      });
      const data = await response.json() as { deletedSetId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to delete this set.');

      setSets((current) => current.filter((candidate) => candidate.id !== set.id));
      invalidateRiftboundBootstrap(session);
      setSelectedSetId(null);
      setSetOwnershipFilter('all');
    } catch (error) {
      setSetsError(error instanceof Error ? error.message : 'Unable to delete this set.');
    } finally {
      setSetDeleting(false);
    }
  };

  const handleSetImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await importSetJson(file);
    } catch (error) {
      setSetsError(error instanceof Error ? error.message : 'Unable to import this set.');
    }
  };

  const handleDeckImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await importDeckJson(file);
    } catch (error) {
      setDecksError(error instanceof Error ? error.message : 'Unable to import this game deck.');
    }
  };

  const adjustSetCard = (card: RiftboundCard, delta: 1 | -1) => {
    setSetBuilderRows((rows) => updateSetBuilderRows(rows, card.id, delta));
  };

  const addAllSetCards = () => {
    setSetBuilderRows((rows) => {
      const nextRows = { ...rows };
      filteredCards.forEach((card) => {
        nextRows[card.id] = (nextRows[card.id] ?? 0) + 1;
      });
      return nextRows;
    });
  };

  const removeAllSetCards = () => {
    setSetBuilderRows((rows) => {
      const nextRows = { ...rows };
      filteredCards.forEach((card) => delete nextRows[card.id]);
      return nextRows;
    });
  };

  const createSet = async () => {
    if (!session) {
      setSetsError('Sign in to create a Riftbound set.');
      return;
    }
    const name = setBuilderName.trim();
    const cards = Object.entries(setBuilderRows).map(([cardId, quantity]) => ({ cardId, quantity }));
    if (!name || cards.length === 0) {
      setSetsError('Enter a set name and select at least one card.');
      return;
    }
    if (setBuilderTotalCopies > 5000) {
      setSetsError('A set cannot contain more than 5000 total card copies.');
      return;
    }

    setSetSaving(true);
    setSetsError('');
    try {
      const response = await fetch('/api/riftbound/sets', {
        method: editingSetId ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setId: editingSetId ?? undefined, name, cards }),
      });
      const data = await response.json() as SetMutationResponse;
      if (!response.ok || !data.set) throw new Error(data.error || 'Unable to create Riftbound set.');
      setSets((current) => editingSetId
        ? current.map((set) => set.id === editingSetId ? data.set as RiftboundSet : set)
        : [...current, data.set as RiftboundSet]);
      invalidateRiftboundBootstrap(session);
      setSelectedSetId(data.set.id);
      setSetBuilderOpen(false);
      setSetBuilderRows({});
      setSetBuilderName('');
      setSetBuilderShowSelectedCards(false);
      setEditingSetId(null);
    } catch (error) {
      setSetsError(error instanceof Error ? error.message : 'Unable to create Riftbound set.');
    } finally {
      setSetSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10" aria-label="Riftbound card catalogue">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6">
        <header className="relative z-40 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"
              >
                <Home size={14} />
                Home
              </Link>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Riftbound Collection</p>
            </div>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">KnowLeague - Riftbound</h1>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-slate-900/70 p-1">
            {(['global', 'inventory', 'sets'] as InventoryTab[]).map((tab) => {
              const active = activeTab === tab;
              const label = tab === 'global' ? 'Global' : tab === 'inventory' ? 'Inventory' : 'Decks';
              const count = tab === 'global' ? cards.length : tab === 'inventory' ? ownedUniqueCount : decks.length;
              return (
                <button
                  key={tab}
                  type="button"
                  disabled={(setBuilderOpen || deckBuilderOpen) && tab !== 'sets'}
                  onClick={() => {
                    if (tab === 'sets') {
                      setActiveTab('sets');
                      setSetBuilderOpen(false);
                      setEditingSetId(null);
                      setSelectedSetId(null);
                      return;
                    }
                    if (setBuilderOpen) return;
                    setActiveTab(tab);
                    if (tab === 'global' && sortMode.startsWith('quantity-')) setSortMode(defaultSortMode);
                  }}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${active ? 'border-amber-200/50 bg-amber-300 text-slate-950 shadow-lg shadow-amber-950/20' : 'border-transparent text-slate-400 hover:border-white/15 hover:bg-slate-800/80 hover:text-white'}`}
                >
                  {label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[0.65rem] ${active ? 'bg-slate-950/15' : 'bg-slate-950 text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)_auto]">
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
                  aria-label="Search Riftbound cards"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-11 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear card search"
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              <AppSelectMenu
                label="Sort"
                value={sortMode}
                options={availableSortOptions}
                onChange={(value) => setSortMode(value)}
                className="min-w-0 [&>span]:sr-only"
                triggerClassName="h-14"
              />

              <button
                type="button"
                aria-label="Open card filters"
                aria-expanded={filtersOpen}
                title="Open card filters"
                onClick={() => setFiltersOpen((open) => !open)}
                className={`inline-flex h-14 w-14 items-center justify-center gap-1 rounded-2xl border text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 ${filtersOpen || activeFilterCount > 0 ? 'border-amber-200/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900'}`}
              >
                <SlidersHorizontal size={18} />
                {activeFilterCount > 0 ? (
                  <span className="-mr-2 -mt-6 rounded-md bg-slate-950 px-1.5 py-0.5 text-[0.65rem] text-amber-200">{activeFilterCount}</span>
                ) : null}
              </button>
            </div>
            <div className={`transition-[max-height,opacity,transform] duration-100 ease-out ${filtersOpen ? 'max-h-[1000px] translate-y-0 opacity-100' : 'pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0'}`}>
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:grid-cols-3">
                <AppSelectMenu label="Set" value={filters.setCode[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.setCode} selectedValues={filters.setCode} multiple onToggle={(value) => toggleFilter('setCode', value)} />
                <AppSelectMenu label="Rarity" value={filters.rarity[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.rarity} selectedValues={filters.rarity} multiple onToggle={(value) => toggleFilter('rarity', value)} />
                <AppSelectMenu label="Card Type" value={filters.cardType[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.cardType} selectedValues={filters.cardType} multiple onToggle={(value) => toggleFilter('cardType', value)} />
                <AppSelectMenu label="Domain" value={filters.domain[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.domain} selectedValues={filters.domain} multiple onToggle={(value) => toggleFilter('domain', value)} />
                <AppSelectMenu label="Energy Cost" value={filters.energyCost[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.energyCost} selectedValues={filters.energyCost} multiple onToggle={(value) => toggleFilter('energyCost', value)} />
                <AppSelectMenu label="Power Cost" value={filters.powerCost[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.powerCost} selectedValues={filters.powerCost} multiple onToggle={(value) => toggleFilter('powerCost', value)} />
                <AppSelectMenu label="Might" value={filters.might[0] ?? ALL_FILTER_VALUE} options={filterOptionsByField.might} selectedValues={filters.might} multiple onToggle={(value) => toggleFilter('might', value)} />
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Minimum price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={filters.minPrice}
                    onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))}
                    placeholder="No minimum"
                    aria-label="Minimum price"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Maximum price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={filters.maxPrice}
                    onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))}
                    placeholder="No maximum"
                    aria-label="Maximum price"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                Showing {filteredCards.length} {activeTab === 'inventory' ? 'owned ' : ''}cards
                {activeTab === 'inventory' && unpricedCopyCount > 0 ? ` · ${unpricedCopyCount} copies have no market price yet` : ''}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {hasUnsavedInventoryChanges ? (
                  <button type="button" onClick={clearPendingInventory} disabled={inventorySaving} className="inline-flex items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/30 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-red-200 transition hover:border-red-200/60 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-60">
                    <Trash2 size={14} />
                    Clear Pending Inventory
                  </button>
                ) : null}
                <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/25 hover:text-white">
                  <RotateCcw size={14} />
                  Reset filters
                </button>
              </div>
            </div>
          </div>
        </header>

        {activeTab === 'inventory' && session && !inventoryLoading && !inventoryError ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6" aria-label="Inventory rarity breakdown">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection breakdown</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{ownedCopyCount} total cards</span>
                <button type="button" onClick={() => setScannerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200">
                  <Camera size={14} />
                  Scan Cards
                </button>
                <button type="button" onClick={() => openCollectionShare(inventoryRows)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200">
                  <Share2 size={14} />
                  Export / Import
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_14rem_auto] lg:items-stretch">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {inventoryRarityOrder.map((rarity) => (
                  <button key={rarity} type="button" onClick={() => applyRarityFilter(rarity)} className={`rounded-2xl border px-3 py-3 text-center transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${filters.rarity.includes(rarity) ? 'border-amber-200/70 bg-amber-300/10' : 'border-white/10 bg-slate-900/70 hover:border-amber-200/50 hover:bg-slate-800'}`}>
                    <p className={`text-xs font-black uppercase tracking-[0.12em] ${rarityStyles[rarity] ?? 'text-slate-300'}`}>{rarity}</p>
                    <p className="mt-1 text-xl font-black text-white">{inventoryRarityCounts.get(rarity) ?? 0}</p>
                  </button>
                ))}
              </div>
              <div className="h-px bg-white/10 lg:h-full" aria-hidden="true" />
              <div className="flex flex-col justify-center rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">{inventoryFilterActive ? 'Filtered Value' : 'Collection Value'}</p>
                  <MarketValueSourceInfo />
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-2xl font-black text-emerald-300">{formatMarketPrice(displayedInventoryValue)}</p>
                  {displayedPendingAddedMarketValue > 0 ? <span className="text-xs font-black text-emerald-300">+{formatMarketPrice(displayedPendingAddedMarketValue)} pending</span> : null}
                </div>
              </div>
              <button type="button" onClick={() => setCollectionHistoryOpen(true)} className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-emerald-200 transition hover:border-emerald-200/50 hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-amber-200">
                <TrendingUp size={16} />
                Value history
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'sets' && !session ? (
          <section className="grid justify-items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
            <PackageOpen size={38} className="text-amber-200" />
            <div>
              <h2 className="text-2xl font-black text-white">Sign in to view your sets</h2>
              <p className="mt-2 text-sm text-slate-400">Your Riftbound sets are saved to your KnowLeague account.</p>
            </div>
            <Link href="/login" className="rounded-xl border border-amber-200/40 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200">Sign in</Link>
          </section>
        ) : activeTab === 'sets' && session && setsLoading ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading your game decks and sets...</section>
        ) : activeTab === 'sets' && session ? (
          deckBuilderOpen ? (
            <section className="grid gap-5 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5 sm:p-6" aria-label="Create Riftbound game deck">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Game deck builder</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{editingDeckId ? 'Edit game deck' : 'Create a game deck'}</h2>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => { setDeckBuilderOpen(false); setDeckBuilderRows(createEmptyDeckBuilderRows()); setDeckBuilderName(''); setDeckBuilderDescription(''); setEditingDeckId(null); setDecksError(''); }} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white">Cancel</button>
                  <button type="button" onClick={() => void createDeck()} disabled={deckSaving} title={deckBuilderDescriptionError || (!deckBuilderValidation.isValid ? (deckBuilderValidation.errors[0] ?? 'Complete the deck checklist first') : undefined)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{deckSaving ? <LoaderCircle size={16} className="animate-spin" /> : null} {editingDeckId ? 'Save Deck' : 'Create Deck'}</button>
                </div>
              </div>
              <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="grid gap-2">
                  <input value={deckBuilderName} onChange={(event) => setDeckBuilderName(event.target.value)} maxLength={80} placeholder="Deck Name" aria-label="Deck Name" autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} className="h-12 rounded-2xl border border-white/10 bg-slate-900/80 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm" />
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-amber-300">Checklist</span>
                      <span className={`text-[0.6rem] font-black uppercase tracking-[0.1em] ${deckBuilderValidation.isValid && !deckBuilderDescriptionError ? 'text-emerald-300' : 'text-slate-500'}`}>{deckBuilderValidation.isValid && !deckBuilderDescriptionError ? 'Ready' : 'In progress'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {RIFTBOUND_DECK_CATEGORY_ORDER.map((category) => {
                        const total = deckBuilderTotals[category];
                        const target = category === 'legend' ? '1' : category === 'runes' ? String(RIFTBOUND_DECK_RUNE_SIZE) : category === 'battlefields' ? String(RIFTBOUND_DECK_BATTLEFIELD_SIZE) : category === 'main' ? String(RIFTBOUND_DECK_MAIN_SIZE) : `0 or ${RIFTBOUND_DECK_SIDEBOARD_SIZE}`;
                        const complete = category === 'sideboard' ? total === 0 || total === RIFTBOUND_DECK_SIDEBOARD_SIZE : total === Number(target);
                        return <button key={category} type="button" onClick={() => setDeckBuilderCategory(category)} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.65rem] font-black transition ${deckBuilderCategory === category ? 'border-amber-200/60 bg-amber-300/10 text-white' : 'border-white/10 bg-slate-950/60 text-slate-400 hover:border-white/25 hover:text-white'} `}><span>{RIFTBOUND_DECK_CATEGORY_LABELS[category]}</span><span className={complete ? 'text-emerald-300' : 'text-amber-200'}>{category === 'sideboard' ? `${total}/${RIFTBOUND_DECK_SIDEBOARD_SIZE}` : `${total}/${target}`}</span></button>;
                      })}
                    </div>
                  </div>
                </div>
                <textarea value={deckBuilderDescription} onChange={(event) => setDeckBuilderDescription(event.target.value)} maxLength={500} placeholder="Deck Description" aria-label="Deck Description" rows={5} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false} className="min-h-[9.5rem] h-full w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm" />
              </div>
              {decksError ? <div className="rounded-2xl border border-red-300/30 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-200"><p>{decksError}</p>{deckBuilderValidation.errors.length > 0 ? <ul className="mt-2 grid gap-1 text-xs text-red-200/80">{deckBuilderValidation.errors.slice(0, 5).map((error) => <li key={error}>· {error}</li>)}</ul> : null}</div> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-sm font-black text-white">{RIFTBOUND_DECK_CATEGORY_LABELS[deckBuilderCategory]}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-slate-900/70 p-1">
                    {(['global', 'inventory'] as SetSourceTab[]).map((source) => (
                      <button key={source} type="button" onClick={() => setDeckBuilderSource(source)} className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition ${deckBuilderSource === source ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{source}</button>
                    ))}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={deckBuilderShowSelectedCards}
                    onClick={() => setDeckBuilderShowSelectedCards((current) => !current)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${deckBuilderShowSelectedCards ? 'border-amber-200/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}
                  >
                    <span>Selected cards</span>
                    <span className={`relative h-5 w-9 rounded-full border transition ${deckBuilderShowSelectedCards ? 'border-amber-200 bg-amber-300' : 'border-white/20 bg-slate-950'}`} aria-hidden="true">
                      <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition ${deckBuilderShowSelectedCards ? 'left-[1.05rem] bg-slate-950' : 'left-0.5 bg-slate-500'}`} />
                    </span>
                  </button>
                </div>
              </div>
              <div className="riftbound-card-grid">
                {deckBuilderVisibleCards.map((card) => (
                  <RiftboundCardRow
                    key={`${deckBuilderCategory}:${card.id}`}
                    card={card}
                    normalQuantity={0}
                    foilQuantity={0}
                    mode="set-selection"
                    setQuantity={deckBuilderRows[deckBuilderCategory][card.id] ?? 0}
                    pendingChange={false}
                    pending={false}
                    onOpen={openDeckCardDetails}
                    onSetAdjust={adjustDeckCard}
                  />
                ))}
              </div>
              {deckBuilderVisibleCards.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">{deckBuilderShowSelectedCards ? 'No cards are selected in this category.' : 'No catalogue cards match this category and your current filters.'}</p> : null}
            </section>
          ) : setBuilderOpen ? (
            <section className="grid gap-4 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5 sm:p-6" aria-label="Create Riftbound set">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Set builder</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{editingSetId ? 'Edit set' : 'Create a new set'}</h2>
                  <p className="mt-1 text-sm text-slate-400">Select cards from the {setBuilderSource} catalogue. Filters apply to Add All and Remove All.</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => { setSetBuilderOpen(false); setSetBuilderRows({}); setSetBuilderName(''); setSetBuilderShowSelectedCards(false); setEditingSetId(null); setSetsError(''); }} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white">Cancel</button>
                  <button type="button" onClick={() => void createSet()} disabled={setSaving || setBuilderTotalCopies === 0} title={setBuilderTotalCopies === 0 ? 'Select at least one card first' : undefined} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{setSaving ? <LoaderCircle size={16} className="animate-spin" /> : null} {editingSetId ? 'Save Changes' : 'Create Set'}</button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input value={setBuilderName} onChange={(event) => setSetBuilderName(event.target.value)} maxLength={80} placeholder="Set Name" aria-label="Set Name" autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} className="h-12 rounded-2xl border border-white/10 bg-slate-900/80 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm" />
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-1">
                  {(['global', 'inventory'] as SetSourceTab[]).map((source) => (
                    <button key={source} type="button" onClick={() => setSetBuilderSource(source)} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.1em] transition ${setBuilderSource === source ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{source}</button>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={addAllSetCards} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white">Add All</button>
                  <button type="button" onClick={removeAllSetCards} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white">Remove All</button>
                </div>
              </div>
              {setsError ? <p className="text-sm font-semibold text-red-200">{setsError}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="text-sm font-black text-white">Card selection</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={setBuilderShowSelectedCards}
                  onClick={() => setSetBuilderShowSelectedCards((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${setBuilderShowSelectedCards ? 'border-amber-200/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}
                >
                  <span>Selected cards</span>
                  <span className={`relative h-5 w-9 rounded-full border transition ${setBuilderShowSelectedCards ? 'border-amber-200 bg-amber-300' : 'border-white/20 bg-slate-950'}`} aria-hidden="true">
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition ${setBuilderShowSelectedCards ? 'left-[1.05rem] bg-slate-950' : 'left-0.5 bg-slate-500'}`} />
                  </span>
                </button>
              </div>
              <div className="riftbound-card-grid">
                {setBuilderVisibleCards.map((card) => (
                  <RiftboundCardRow
                    key={card.id}
                    card={card}
                    normalQuantity={0}
                    foilQuantity={0}
                    mode="set-selection"
                    setQuantity={setBuilderRows[card.id] ?? 0}
                    pendingChange={false}
                    pending={false}
                    onOpen={(card) => openCardDetails(card, false, true)}
                    onSetAdjust={adjustSetCard}
                  />
                ))}
              </div>
              {setBuilderVisibleCards.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">{setBuilderShowSelectedCards ? 'No cards are selected in this view.' : 'No catalogue cards match your current filters.'}</p> : null}
            </section>
          ) : selectedDeck ? (
            <>
              <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <button type="button" onClick={() => setSelectedDeckId(null)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"><ArrowLeft size={14} /> All Game Decks</button>
                    <h2 className="mt-3 text-2xl font-black text-white">{selectedDeck.name}</h2>
                    {selectedDeck.description ? <p className="mt-2 w-full max-w-full text-sm leading-6 text-slate-400 sm:max-w-[70%]">{selectedDeck.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <RiftboundDeckFavoriteButton deckId={selectedDeck.id} session={session} />
                    <button type="button" onClick={() => openDeckShare(selectedDeck)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><Share2 size={14} /> Share / Export</button>
                    <button type="button" onClick={() => editDeck(selectedDeck)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><Pencil size={14} /> Edit Deck</button>
                    <button type="button" onClick={() => void deleteDeck(selectedDeck)} disabled={deckDeleting} className="inline-flex items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-red-200 transition hover:border-red-200/60 hover:bg-red-950/50 disabled:cursor-wait disabled:opacity-60"><Trash2 size={14} /> {deckDeleting ? 'Deleting...' : 'Delete Deck'}</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Created {formatDeckCreatedDate(selectedDeck.created_at)}</p>
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Deck view options">
                    {([
                      { value: 'card' as const, label: 'Card view', icon: Grid2X2 },
                      { value: 'list' as const, label: 'List view', icon: LayoutList },
                      { value: 'compact' as const, label: 'Compact view', icon: QrCode },
                    ]).map(({ value, label, icon: Icon }) => (
                      <button key={value} type="button" aria-pressed={deckViewMode === value} onClick={() => setDeckViewMode(value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${deckViewMode === value ? 'border-amber-200/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}><Icon size={14} />{label}</button>
                    ))}
                  </div>
                </div>
                {decksError ? <p className="text-sm font-semibold text-red-200">{decksError}</p> : null}
              </section>
              {deckViewMode === 'compact' ? (
                <RiftboundCompactDeckView
                  shareUrl={selectedDeckCompactShareUrl}
                  creatorName={getShareCreatorName(session)}
                  deckName={selectedDeck.name}
                  createdAt={selectedDeck.created_at}
                  legendEntries={collapseRiftboundDeckEntries(selectedDeckLegendCards)}
                  championEntries={collapseRiftboundDeckEntries(selectedDeckChampionCards)}
                  mainEntries={collapseRiftboundDeckEntries(selectedDeckMainCards)}
                  runeEntries={collapseRiftboundDeckEntries(selectedDeckRuneCards)}
                  battlefieldEntries={collapseRiftboundDeckEntries(selectedDeckBattlefieldCards)}
                  sideboardEntries={collapseRiftboundDeckEntries(selectedDeckSideboardCards)}
                  onOpen={openDeckCardDetails}
                />
              ) : (
                <>
                  <div className={`grid ${deckViewMode === 'list' ? 'gap-2' : 'gap-4'} lg:grid-cols-[18rem_minmax(0,1fr)]`}>
                    <section className="grid content-start gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Legend</h3><RiftboundDeckEntries entries={selectedDeckLegendCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} gridClassName="riftbound-card-grid" highlightCardId={selectedDeck.legend_card_id} /></section>
                    <section className="grid content-start gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Champion Units</h3><RiftboundDeckEntries entries={selectedDeckChampionCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} gridClassName="riftbound-card-grid" /></section>
                  </div>
                  <section className="grid gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Main Deck</h3><RiftboundDeckEntries entries={selectedDeckMainCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} /></section>
                  <section className="grid gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Runes</h3><RiftboundDeckEntries entries={selectedDeckRuneCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} /></section>
                  <section className="grid gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Battlefields</h3><RiftboundDeckEntries entries={selectedDeckBattlefieldCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} /></section>
                  {selectedDeckSideboardCards.length > 0 ? <section className="grid gap-3"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Sideboard</h3><RiftboundDeckEntries entries={selectedDeckSideboardCards} listView={deckViewMode === 'list'} onOpen={openDeckCardDetails} /></section> : null}
                </>
              )}
            </>
          ) : selectedSet ? (
            <>
              <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <button type="button" onClick={() => { setSelectedSetId(null); setSetOwnershipFilter('all'); }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"><ArrowLeft size={14} /> All Sets</button>
                    <h2 className="mt-3 text-2xl font-black text-white">{selectedSet.name}</h2>
                    <p className="mt-1 text-xs italic text-slate-500">Created {formatDeckCreatedDate(selectedSet.created_at)}</p>
                    <p className="mt-1 text-sm text-slate-400">{selectedSetCards.length} total cards</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => openCollectionShare(getSetShareRows(selectedSet), 'set', selectedSet.name)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><Share2 size={14} /> Share / Export</button>
                    <button type="button" onClick={() => editSet(selectedSet)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><Pencil size={14} /> Edit Set</button>
                    <button type="button" onClick={() => void deleteSet(selectedSet)} disabled={setDeleting} className="inline-flex items-center gap-2 rounded-xl border border-red-300/30 bg-red-950/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-red-200 transition hover:border-red-200/60 hover:bg-red-950/50 disabled:cursor-wait disabled:opacity-60"><Trash2 size={14} /> {setDeleting ? 'Deleting...' : 'Delete Set'}</button>
                  </div>
                </div>
                {setsError ? <p className="text-sm font-semibold text-red-200">{setsError}</p> : null}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_14rem] lg:items-stretch">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {inventoryRarityOrder.map((rarity) => (
                      <div key={rarity} className="rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-3 text-center">
                        <p className={`text-xs font-black uppercase tracking-[0.12em] ${rarityStyles[rarity] ?? 'text-slate-300'}`}>{rarity}</p>
                        <p className="mt-1 text-xl font-black text-white">{selectedSetRarityCounts.get(rarity) ?? 0}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-px bg-white/10 lg:h-full" aria-hidden="true" />
                  <div className="flex flex-col justify-center rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                    <div className="flex items-center gap-2"><p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Set value</p><MarketValueSourceInfo /></div>
                    <p className="mt-1 text-2xl font-black text-emerald-300">{formatMarketPrice(selectedSetValue)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Inventory ownership</p>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'owned', 'missing'] as SetOwnershipFilter[]).map((ownershipFilter) => (
                      <button key={ownershipFilter} type="button" onClick={() => setSetOwnershipFilter(ownershipFilter)} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition ${setOwnershipFilter === ownershipFilter ? 'border-amber-200/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}>{ownershipFilter === 'all' ? 'All cards' : ownershipFilter}</button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Set view options">
                    {([
                      { value: 'card' as const, label: 'Card view', icon: Grid2X2 },
                      { value: 'list' as const, label: 'List view', icon: LayoutList },
                      { value: 'compact' as const, label: 'Compact view', icon: QrCode },
                    ]).map(({ value, label, icon: Icon }) => (
                      <button key={value} type="button" aria-pressed={deckViewMode === value} onClick={() => setDeckViewMode(value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${deckViewMode === value ? 'border-amber-200/60 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/25 hover:text-white'}`}><Icon size={14} />{label}</button>
                    ))}
                  </div>
                </div>
              </section>
              {deckViewMode === 'compact' ? (
                <RiftboundCompactDeckView
                  shareUrl={selectedSetCompactShareUrl}
                  creatorName={getShareCreatorName(session)}
                  deckName={selectedSet.name}
                  createdAt={selectedSet.created_at}
                  legendEntries={[]}
                  championEntries={[]}
                  mainEntries={collapseRiftboundDeckEntries(displayedSetCards)}
                  runeEntries={[]}
                  battlefieldEntries={[]}
                  sideboardEntries={[]}
                  mainLabel="Set Cards"
                  onOpen={openCardDetails}
                />
              ) : deckViewMode === 'list' ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
                  {displayedSetCards.map(({ card, key }) => <RiftboundDeckListRow key={key} card={card} onOpen={openCardDetails} />)}
                </div>
              ) : (
                <div className="riftbound-card-grid">
                  {displayedSetCards.map(({ card, key, owned }) => (
                    <RiftboundCardRow key={key} card={card} normalQuantity={0} foilQuantity={0} mode="set-view" ownership={owned ? 'owned' : 'missing'} pendingChange={false} pending={false} onOpen={openCardDetails} className="w-full max-w-[18rem] justify-self-center" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-5">
              <section className="grid gap-4 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5 sm:p-6" aria-label="Riftbound game decks">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Game decks</p>
                    <p className="mt-1 text-sm text-slate-400">Build decks that follow Riftbound constructed deck rules.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={deckImportInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleDeckImportFile(event)} />
                    <button type="button" onClick={() => deckImportInputRef.current?.click()} disabled={decks.length >= RIFTBOUND_DECK_MAX_COUNT} title={decks.length >= RIFTBOUND_DECK_MAX_COUNT ? `You can create up to ${RIFTBOUND_DECK_MAX_COUNT} game decks.` : undefined} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Import Deck</button>
                    <button type="button" onClick={startDeckBuilder} disabled={decks.length >= RIFTBOUND_DECK_MAX_COUNT} title={decks.length >= RIFTBOUND_DECK_MAX_COUNT ? `You can create up to ${RIFTBOUND_DECK_MAX_COUNT} game decks.` : undefined} className="rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">Create Deck</button>
                  </div>
                </div>
                {decksError ? <p className="text-sm font-semibold text-red-200">{decksError}</p> : null}
                {decks.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">You have not created any game decks yet.</p> : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {decks.map((deck) => {
                      const legend = cardsById.get(deck.legend_card_id);
                      return <article key={deck.id} className="relative rounded-2xl border border-white/10 bg-slate-900/70 p-4 transition hover:border-amber-200/50 hover:bg-slate-800"><button type="button" onClick={() => { setSelectedDeckId(deck.id); setSelectedSetId(null); setDeckViewMode('compact'); setDecksError(''); }} className="block w-full rounded-xl p-1 text-left focus:outline-none focus:ring-2 focus:ring-amber-200"><p className="truncate pr-12 text-lg font-black text-white">{deck.name}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Legend: {legend?.displayName ?? 'Unknown'}</p><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-300">{deck.description || 'No description'}</p><p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Created {formatDeckCreatedDate(deck.created_at)}</p></button><div className="absolute right-4 top-4"><RiftboundDeckFavoriteButton deckId={deck.id} session={session} /></div></article>;
                    })}
                  </div>
                )}
              </section>
              <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6" aria-label="Riftbound sets">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Your sets</p>
                    <p className="mt-1 text-sm text-slate-400">Create up to 6 card sets with any cards and quantities.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input ref={setImportInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleSetImportFile(event)} />
                    <button type="button" onClick={() => setImportInputRef.current?.click()} disabled={sets.length >= 6} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Import Set</button>
                    <button type="button" onClick={startSetBuilder} disabled={sets.length >= 6} className="rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">Create Set</button>
                  </div>
                </div>
                {setsError ? <p className="text-sm font-semibold text-red-200">{setsError}</p> : null}
                {sets.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">You have not created any sets yet.</p> : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sets.map((set) => <button key={set.id} type="button" onClick={() => { setSelectedSetId(set.id); setSelectedDeckId(null); setDeckViewMode('compact'); setSetOwnershipFilter('all'); }} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-left transition hover:border-amber-200/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"><p className="truncate text-lg font-black text-white">{set.name}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{expandSetCards(set).length} cards</p></button>)}
                  </div>
                )}
              </section>
            </div>
          )
        ) : activeTab === 'inventory' && !session ? (
          <section className="grid justify-items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
            <PackageOpen size={38} className="text-amber-200" />
            <div>
              <h2 className="text-2xl font-black text-white">Sign in to view your inventory</h2>
              <p className="mt-2 text-sm text-slate-400">Your card collection is saved to your KnowLeague account.</p>
            </div>
            <Link href="/login" className="rounded-xl border border-amber-200/40 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200">Sign in</Link>
          </section>
        ) : activeTab === 'inventory' && inventoryLoading ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading your inventory...</section>
        ) : activeTab === 'inventory' && inventoryError ? (
          <section className="rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200">{inventoryError}</section>
        ) : activeTab === 'sets' && selectedSet ? (
          <div className="riftbound-card-grid">
            {selectedSetCards.map(({ card, key }) => (
              <RiftboundCardRow
                key={key}
                card={card}
                normalQuantity={0}
                foilQuantity={0}
                mode="set-view"
                pendingChange={false}
                pending={false}
                onOpen={openCardDetails}
              />
            ))}
          </div>
        ) : filteredCards.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">
            {activeTab === 'inventory' ? 'Your inventory does not match these filters yet.' : activeTab === 'sets' ? 'No cards match these filters.' : 'No cards match these filters.'}
          </section>
        ) : (
          <div className="riftbound-card-grid">
            {filteredCards.map((card) => (
              <RiftboundCardRow
                key={card.id}
                card={card}
                normalQuantity={getFinishQuantity(inventoryByFinish, card.id, 'normal')}
                foilQuantity={getFinishQuantity(inventoryByFinish, card.id, 'foil')}
                mode={activeTab === 'sets' && setBuilderOpen ? 'set-selection' : 'inventory'}
                setQuantity={setBuilderRows[card.id] ?? 0}
                pendingChange={
                  activeTab !== 'sets'
                  && (getFinishQuantity(inventoryByFinish, card.id, 'normal') !== getFinishQuantity(savedInventoryByFinish, card.id, 'normal')
                  || getFinishQuantity(inventoryByFinish, card.id, 'foil') !== getFinishQuantity(savedInventoryByFinish, card.id, 'foil')
                  )
                }
                pending={inventorySaving}
                onOpen={setBuilderOpen ? (card) => openCardDetails(card, false, true) : openCardDetails}
                onAdjust={setBuilderOpen ? undefined : adjustInventory}
                onSetAdjust={setBuilderOpen ? adjustSetCard : undefined}
              />
            ))}
          </div>
        )}
      </section>
      {selectedCard ? (
        <RiftboundCardDetailsModal
          card={selectedCard}
          normalQuantity={getFinishQuantity(inventoryByFinish, selectedCard.id, 'normal')}
          foilQuantity={getFinishQuantity(inventoryByFinish, selectedCard.id, 'foil')}
          latestSnapshotDate={latestSnapshotDate}
          pending={inventorySaving}
          showInventoryControls={selectedCardCanAdjustInventory}
          showMarketDetails={selectedCardShowMarketDetails}
          preferenceSession={session}
          onClose={() => setSelectedCard(null)}
          onAdjust={adjustInventory}
        />
      ) : null}
      {collectionHistoryOpen && session ? (
        <RiftboundCollectionValueHistoryModal session={session} onClose={() => setCollectionHistoryOpen(false)} />
      ) : null}
      {scannerOpen && session ? (
        <RiftboundCardScannerModal
          cards={cards}
          accessToken={session.access_token}
          onClose={() => setScannerOpen(false)}
          onAdd={addScannedCard}
        />
      ) : null}
      {collectionShareOpen ? (
        <RiftboundCollectionShareModal
          rows={collectionShareRows}
          kind={collectionShareKind}
          title={collectionShareTitle}
          metadata={collectionShareMetadata}
          deck={collectionShareDeck}
          onClose={() => setCollectionShareOpen(false)}
          onImport={collectionShareKind === 'collection' ? importCollectionJson : collectionShareKind === 'set' ? importSetJson : undefined}
          onExportJson={collectionShareKind === 'deck' && collectionShareDeck ? () => downloadDeckJson(collectionShareDeck) : undefined}
        />
      ) : null}
      {hasUnsavedInventoryChanges ? (
        <button
          type="button"
          onClick={() => void saveInventory()}
          disabled={inventorySaving}
          className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-2xl border border-amber-200/50 bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-amber-950/40 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70 sm:bottom-6 sm:left-6"
        >
          {inventorySaving ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
          {inventorySaving ? 'Updating...' : 'Update Inventory'}
        </button>
      ) : null}
    </main>
  );
}
