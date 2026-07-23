'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, Copy, ExternalLink, FileDown, Home, Info, Link2, LoaderCircle, Minus, PackageOpen, Plus, RotateCcw, Save, Search, Share2, SlidersHorizontal, TrendingUp, X } from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';

type InventoryTab = 'global' | 'inventory';

type InventoryItem = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

type InventoryResponse = {
  items?: InventoryItem[];
  error?: string;
};

type InventoryMutationResponse = {
  items?: InventoryItem[];
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

type SortMode =
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

type InventoryFilters = {
  setCode: string[];
  rarity: string[];
  cardType: string[];
  domain: string[];
  energyCost: string[];
  powerCost: string[];
  might: string[];
};

const ALL_FILTER_VALUE = 'all';
const PRICE_HISTORY_DAYS = 30;
const PRICE_HISTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PRICE_HISTORY_STORAGE_PREFIX = 'knowleague:riftbound-price-history:v1:';
const PRICE_HISTORY_STORAGE_LIMIT = 100;
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

function getPriceHistoryStorageKey(cardId: string) {
  return `${PRICE_HISTORY_STORAGE_PREFIX}${cardId}`;
}

function getCachedPriceHistory(cardId: string) {
  const now = Date.now();
  const memoryEntry = priceHistoryMemoryCache.get(cardId);
  if (memoryEntry && now - memoryEntry.fetchedAt < PRICE_HISTORY_CACHE_TTL_MS) {
    return memoryEntry.history;
  }
  if (memoryEntry) priceHistoryMemoryCache.delete(cardId);

  if (typeof window === 'undefined') return null;

  try {
    const rawValue = window.localStorage.getItem(getPriceHistoryStorageKey(cardId));
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue) as Partial<CachedRiftboundPriceHistory>;
    const history = parsePriceHistory(parsedValue.history);
    if (typeof parsedValue.fetchedAt !== 'number' || !Number.isFinite(parsedValue.fetchedAt) || !history || now - parsedValue.fetchedAt >= PRICE_HISTORY_CACHE_TTL_MS) {
      return null;
    }

    priceHistoryMemoryCache.set(cardId, { fetchedAt: parsedValue.fetchedAt, history });
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

function cachePriceHistory(cardId: string, history: RiftboundPriceHistoryEntry[]) {
  const cachedEntry = { fetchedAt: Date.now(), history };
  priceHistoryMemoryCache.set(cardId, cachedEntry);

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getPriceHistoryStorageKey(cardId), JSON.stringify(cachedEntry));
    prunePriceHistoryStorage();
  } catch {
    // Browser storage is an optimization; the in-memory cache remains available.
  }
}

function loadPriceHistory(cardId: string) {
  const cachedHistory = getCachedPriceHistory(cardId);
  if (cachedHistory) return Promise.resolve(cachedHistory);

  const existingRequest = priceHistoryRequests.get(cardId);
  if (existingRequest) return existingRequest;

  const request = fetch(`/api/riftbound/prices/${encodeURIComponent(cardId)}?days=${PRICE_HISTORY_DAYS}`, {
    cache: 'force-cache',
  })
    .then(async (response) => {
      const data = await response.json() as RiftboundPriceHistoryResponse;
      if (!response.ok) throw new Error(data.error || 'Unable to load market value history.');
      const history = data.history ?? [];
      cachePriceHistory(cardId, history);
      return history;
    })
    .finally(() => {
      priceHistoryRequests.delete(cardId);
    });

  priceHistoryRequests.set(cardId, request);
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

const emptyFilters: InventoryFilters = {
  setCode: [ALL_FILTER_VALUE],
  rarity: [ALL_FILTER_VALUE],
  cardType: [ALL_FILTER_VALUE],
  domain: [ALL_FILTER_VALUE],
  energyCost: [ALL_FILTER_VALUE],
  powerCost: [ALL_FILTER_VALUE],
  might: [ALL_FILTER_VALUE],
};

const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
const inventoryRarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
const defaultSortMode: SortMode = 'none';

const sortOptions: AppSelectOption<SortMode>[] = [
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

function getSortMarketValue(card: RiftboundCard) {
  return getMarketPriceForFinish(card, 'foil');
}

function compareNullableNumbers(left: number | null, right: number | null, direction: 1 | -1) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function compareRiftboundCards(left: RiftboundCard, right: RiftboundCard, mode: SortMode, inventoryByCard: Map<string, number>) {
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

function formatMarketPriceOrUnavailable(value: number | null) {
  return value === null ? 'N/A' : currencyFormatter.format(value);
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function jumbledValues(values: string[]) {
  const getSortValue = (value: string) => value.split('').reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 100003, 17);
  return [...values].sort((left, right) => getSortValue(left) - getSortValue(right) || left.localeCompare(right));
}

function filterOptions(
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

function encodeCollectionRows(rows: InventoryItem[]) {
  const payload = JSON.stringify(rows.map((row) => ({ card_id: row.card_id, finish: row.finish, quantity: row.quantity })));
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getCollectionShareUrl(rows: InventoryItem[]) {
  return `${window.location.origin}/inventory/share?data=${encodeURIComponent(encodeCollectionRows(rows))}`;
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

function toggleFilterValue(values: string[], nextValue: string) {
  if (nextValue === ALL_FILTER_VALUE) return [ALL_FILTER_VALUE];

  const selectedValues = values.filter((value) => value !== ALL_FILTER_VALUE);
  const nextValues = selectedValues.includes(nextValue)
    ? selectedValues.filter((value) => value !== nextValue)
    : [...selectedValues, nextValue];

  return nextValues.length > 0 ? nextValues : [ALL_FILTER_VALUE];
}

function matchesFilter(values: string[], candidates: string | string[]) {
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

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-xs font-bold text-slate-200" title={value}>{value}</dd>
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

function RiftboundPriceHistoryChart({ history }: { history: RiftboundPriceHistoryEntry[] }) {
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
        {series.flatMap((entry) => entry.values.map((value, index) => value === null ? null : (
          <circle key={`${entry.finish}-${dates[index]}`} cx={getX(index)} cy={getY(value)} r="4" fill="#030712" stroke={entry.color} strokeWidth="2">
            <title>{`${entry.label} · ${formatHistoryDate(dates[index])} · ${formatMarketPriceOrUnavailable(value)}`}</title>
          </circle>
        )))}
        {labelIndexes.map((index) => (
          <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill="#64748b" fontSize="11">{formatHistoryDate(dates[index])}</text>
        ))}
      </svg>
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
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-200 shadow-xl group-hover:block group-focus-within:block">
        Estimated from captured market prices provided by our pricing source. It is not a guaranteed sale price.
      </span>
    </span>
  );
}

function RiftboundCollectionValueHistoryChart({ history }: { history: RiftboundCollectionValueHistoryEntry[] }) {
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
        {history.map((entry, index) => (
          <circle key={entry.date} cx={getX(index)} cy={getY(entry.value)} r="4" fill="#030712" stroke="#6ee7b7" strokeWidth="2">
            <title>{`${formatHistoryDate(entry.date)} · ${formatMarketPrice(entry.value)} · ${entry.pricedCopies}/${entry.totalCopies} copies priced`}</title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill="#64748b" fontSize="11">{formatHistoryDate(history[index].date)}</text>
        ))}
      </svg>
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

const RiftboundCardRow = memo(function RiftboundCardRow({
  card,
  normalQuantity,
  foilQuantity,
  pendingChange,
  pending,
  onOpen,
  onAdjust,
}: {
  card: RiftboundCard;
  normalQuantity: number;
  foilQuantity: number;
  pendingChange: boolean;
  pending: boolean;
  onOpen: (card: RiftboundCard) => void;
  onAdjust: (card: RiftboundCard, finish: InventoryItem['finish'], delta: 1 | -1) => void;
}) {
  const finishOptions = getCardFinishOptions(card);

  return (
    <article className={`flex min-w-0 flex-col rounded-2xl border bg-slate-950/80 p-3 transition-colors hover:bg-slate-950 sm:p-4 ${pendingChange ? 'border-amber-300/80 shadow-[0_0_18px_rgba(251,191,36,0.12)]' : 'border-white/10 hover:border-white/20'}`}>
      <button
        type="button"
        onClick={() => onOpen(card)}
        className="flex min-w-0 flex-1 flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <span className="relative order-2 mt-3 aspect-[744/1039] w-full max-w-[11rem] shrink-0 overflow-hidden rounded-xl bg-slate-900">
          <Image
            src={card.imageUrl}
            alt={`${card.displayName} card artwork`}
            fill
            sizes="176px"
            draggable={false}
            className="object-cover"
            loading="lazy"
          />
        </span>
        <span className="order-1 min-w-0 w-full">
          <span className="block truncate text-lg font-black tracking-tight text-white" title={card.displayName}>{card.displayName}</span>
          <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
        </span>
      </button>

      <div className={`mt-3 grid shrink-0 gap-2 ${finishOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {finishOptions.map((finish) => (
          <div key={finish} className="flex min-w-0 flex-col items-center gap-1">
            <FinishInventoryControls
              card={card}
              finish={finish}
              quantity={finish === 'foil' ? foilQuantity : normalQuantity}
              pending={pending}
              onAdjust={(nextFinish, delta) => onAdjust(card, nextFinish, delta)}
            />
            <span className={`whitespace-nowrap text-[0.65rem] font-semibold ${finish === 'foil' ? 'text-amber-200/80' : 'text-slate-500'}`}>
              {getFinishLabel(finish)} {formatMarketPriceOrUnavailable(getMarketPriceForFinish(card, finish))}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
});

function RiftboundCardDetailsModal({
  card,
  normalQuantity,
  foilQuantity,
  pending,
  onClose,
  onAdjust,
}: {
  card: RiftboundCard;
  normalQuantity: number;
  foilQuantity: number;
  pending: boolean;
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
    setPriceHistoryLoading(true);

    void loadPriceHistory(card.id)
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
  }, [card.id]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${card.displayName} details`}
        className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close card details"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          <X size={18} />
        </button>
        <div className="absolute right-20 top-4 z-10 flex items-center gap-2">
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

        <div className="grid gap-6 p-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-7">
          <div className="relative mx-auto aspect-[744/1039] w-56 overflow-hidden rounded-2xl bg-slate-900 sm:mx-0 sm:w-56">
            <Image src={card.imageUrl} alt={`${card.displayName} card artwork`} fill sizes="224px" draggable={false} className="object-cover" />
          </div>

          <div className="grid min-w-0 gap-5">
            <div className="min-w-0 pr-40 sm:pr-44">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{card.setName} · {card.setCode} {card.numberLabel}</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{card.displayName}</h2>
                <p className={`mt-2 text-sm font-black ${rarityClassName}`}>{card.rarity}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
                  </div>
                );
              })}
            </div>

            <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-3">
              <DetailValue label="Number" value={`${card.setCode} ${card.numberLabel}`} />
              <DetailValue label="Tag" value={card.tags.join('; ') || 'N/A'} />
              <DetailValue label="Energy" value={String(card.energyCost)} />
              <DetailValue label="Card Type" value={card.cardTypeLabels.join('; ')} />
              <DetailValue label="Finish Options" value={card.finishOptions.join('; ')} />
              <DetailValue label="Power" value={String(card.powerCost)} />
              <DetailValue label="Domain" value={card.domains.join('; ') || 'Colorless'} />
              <DetailValue label="Artist" value={card.artist || 'N/A'} />
              <DetailValue label="Might" value={String(card.might)} />
            </dl>

            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Product Details</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{card.productDetails}</p>
            </div>

            <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">
              View Official Card
              <ExternalLink size={14} />
            </a>

            <div className="border-t border-white/10 pt-5">
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
            </div>
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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Collection value history"
        className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50 sm:p-7"
        onMouseDown={(event) => event.stopPropagation()}
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

function RiftboundCollectionShareModal({ rows, onClose }: { rows: InventoryItem[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => (typeof window === 'undefined' ? '' : getCollectionShareUrl(rows)), [rows]);

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

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share or export collection" className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50 sm:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close share collection dialog" onClick={onClose} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={18} /></button>
        <div className="pr-14">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection tools</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Share or export your collection</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">The share link is a read-only snapshot of your current inventory. Anyone with the link can see the cards and quantities included in it.</p>
        </div>
        <div className="mt-6 grid gap-3">
          <button type="button" onClick={() => void copyShareUrl()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/50 bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200">
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
          <button type="button" onClick={openPrintView} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200 transition hover:border-white/25 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200">
            <FileDown size={17} />
            Open print / Save as PDF view
          </button>
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-xs leading-5 text-slate-500"><Link2 size={15} className="mt-0.5 shrink-0 text-slate-400" /> The link contains a snapshot, so it will not change when your inventory changes later.</div>
      </div>
    </div>
  );
}

export function RiftboundCardGrid() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('global');
  const [query, setQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(defaultSortMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<InventoryFilters>(emptyFilters);
  const [inventoryRows, setInventoryRows] = useState<InventoryItem[]>([]);
  const [savedInventoryRows, setSavedInventoryRows] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [inventorySaving, setInventorySaving] = useState(false);
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [collectionHistoryOpen, setCollectionHistoryOpen] = useState(false);
  const [collectionShareOpen, setCollectionShareOpen] = useState(false);

  const loadInventory = useCallback(async (nextSession: Session) => {
    const storageKey = getInventoryDraftStorageKey(nextSession.user.id);
    const storedDraft = readStoredInventoryDraft(storageKey);
    setInventoryRows(storedDraft?.rows ?? []);
    setSavedInventoryRows(storedDraft?.savedRows ?? []);
    setInventoryLoading(true);
    setInventoryError('');
    if (storedDraft) setInventoryLoading(false);

    try {
      const response = await fetch('/api/riftbound/inventory', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json() as InventoryResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load your Riftbound inventory.');
      }
      const savedRows = data.items ?? [];
      const latestStoredDraft = readStoredInventoryDraft(storageKey);
      setInventoryRows(latestStoredDraft?.rows ?? savedRows);
      setSavedInventoryRows(savedRows);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to load your Riftbound inventory.');
      setInventoryRows(storedDraft?.rows ?? []);
      setSavedInventoryRows(storedDraft?.savedRows ?? []);
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => subscribeToAuthSession((nextSession) => {
    setSession(nextSession);
    if (nextSession) {
      void loadInventory(nextSession);
    } else {
      setInventoryRows([]);
      setSavedInventoryRows([]);
      setInventoryLoading(false);
      setInventoryError('');
    }
  }), [loadInventory]);

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
  const deferredTagQuery = useDeferredValue(tagQuery);
  const cardSearchIndex = useMemo(() => RIFTBOUND_CARDS.map((card) => ({
    card,
    searchableText: [
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
    ].join(' ').toLowerCase(),
  })), []);

  const filterOptionsByField = useMemo(() => {
    const setNames = new Map(RIFTBOUND_CARDS.map((card) => [card.setCode, card.setName]));

    return {
    setCode: filterOptions(
      jumbledValues(uniqueSorted(RIFTBOUND_CARDS.map((card) => card.setCode))),
      'All Sets',
      (setCode) => `${setCode} - ${setNames.get(setCode) ?? setCode}`,
    ),
    rarity: filterOptions(rarityOrder.filter((rarity) => RIFTBOUND_CARDS.some((card) => card.rarity === rarity)), 'All Rarities'),
    cardType: filterOptions(jumbledValues(uniqueSorted(RIFTBOUND_CARDS.map((card) => card.cardType))), 'All Card Types'),
    domain: filterOptions(
      ['Colorless', 'Body', 'Mind', 'Order', 'Chaos', 'Calm', 'Fury'].filter((domain) => RIFTBOUND_CARDS.some((card) => card.domains.includes(domain))),
      'All Domains',
    ),
    energyCost: filterOptions(jumbledValues(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.energyCost)))), 'All Energy Costs'),
    powerCost: filterOptions(jumbledValues(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.powerCost)))), 'All Power Costs'),
    might: filterOptions(jumbledValues(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.might)))), 'All Might Values'),
    };
  }, []);

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const normalizedTagQuery = deferredTagQuery.trim().toLowerCase();

    const matchingCards = cardSearchIndex.filter(({ card, searchableText }) => {
      const quantity = getCardQuantity(inventoryByCard, card.id);
      const savedQuantity = getCardQuantity(savedInventoryByCard, card.id);
      if (activeTab === 'inventory' && quantity === 0 && savedQuantity === 0) return false;
      if (!matchesFilter(filters.setCode, card.setCode)) return false;
      if (!matchesFilter(filters.rarity, card.rarity)) return false;
      if (!matchesFilter(filters.cardType, card.cardType)) return false;
      if (!matchesFilter(filters.domain, card.domains)) return false;
      if (!matchesFilter(filters.energyCost, String(card.energyCost))) return false;
      if (!matchesFilter(filters.powerCost, String(card.powerCost))) return false;
      if (!matchesFilter(filters.might, String(card.might))) return false;
      if (normalizedTagQuery && !card.tags.some((tag) => tag.toLowerCase().includes(normalizedTagQuery))) return false;

      if (!normalizedQuery) return true;
      return searchableText.includes(normalizedQuery);
    }).map(({ card }) => card);

    return matchingCards.sort((left, right) => compareRiftboundCards(left, right, sortMode, inventoryByCard));
  }, [activeTab, cardSearchIndex, deferredQuery, deferredTagQuery, filters, inventoryByCard, savedInventoryByCard, sortMode]);

  const ownedUniqueCount = inventoryByCard.size;
  const ownedCopyCount = Array.from(inventoryByCard.values()).reduce((total, quantity) => total + quantity, 0);
  const unpricedCopyCount = inventoryRows.reduce((total, row) => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === row.card_id);
    return total + (card && getMarketPriceForFinish(card, row.finish) === null ? row.quantity : 0);
  }, 0);
  const totalMarketValue = inventoryRows.reduce((total, row) => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === row.card_id);
    return total + (card ? (getMarketPriceForFinish(card, row.finish) ?? 0) * row.quantity : 0);
  }, 0);
  const inventoryRarityCounts = useMemo(() => {
    const counts = new Map(inventoryRarityOrder.map((rarity) => [rarity, 0]));
    inventoryRows.forEach((row) => {
      const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === row.card_id);
      if (card && counts.has(card.rarity)) {
        counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + row.quantity);
      }
    });
    return counts;
  }, [inventoryRows]);
  const activeFilterCount = Object.values(filters).reduce(
    (total, values) => total + values.filter((value) => value !== ALL_FILTER_VALUE).length,
    0,
  ) + (tagQuery.trim() ? 1 : 0);
  const inventoryChanges = useMemo(
    () => getInventoryChanges(savedInventoryRows, inventoryRows),
    [inventoryRows, savedInventoryRows],
  );
  const hasUnsavedInventoryChanges = inventoryChanges.length > 0;
  const availableSortOptions = activeTab === 'inventory'
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
  }, [session]);

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
    setTagQuery('');
    setFilters(emptyFilters);
  };

  const toggleFilter = (field: keyof InventoryFilters, value: string) => {
    setFilters((current) => ({ ...current, [field]: toggleFilterValue(current[field], value) }));
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

          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-900/70 p-1">
            {(['global', 'inventory'] as InventoryTab[]).map((tab) => {
              const active = activeTab === tab;
              const label = tab === 'global' ? 'Global' : 'Inventory';
              const count = tab === 'global' ? RIFTBOUND_CARDS.length : ownedUniqueCount;
              return (
                <button
                  key={tab}
                  type="button"
                onClick={() => {
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
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
                  aria-label="Search Riftbound cards"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-11 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
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
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Tag</span>
                  <input
                    value={tagQuery}
                    onChange={(event) => setTagQuery(event.target.value)}
                    placeholder="Filter by tag"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                Showing {filteredCards.length} {activeTab === 'inventory' ? 'owned ' : ''}cards
                {activeTab === 'inventory' && unpricedCopyCount > 0 ? ` · ${unpricedCopyCount} copies have no market price yet` : ''}
              </p>
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/25 hover:text-white">
                <RotateCcw size={14} />
                Reset filters
              </button>
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
                <button type="button" onClick={() => setCollectionShareOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200">
                  <Share2 size={14} />
                  Share / Export
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_14rem_auto] lg:items-stretch">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {inventoryRarityOrder.map((rarity) => (
                  <div key={rarity} className="rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-3 text-center">
                    <p className={`text-xs font-black uppercase tracking-[0.12em] ${rarityStyles[rarity] ?? 'text-slate-300'}`}>{rarity}</p>
                    <p className="mt-1 text-xl font-black text-white">{inventoryRarityCounts.get(rarity) ?? 0}</p>
                  </div>
                ))}
              </div>
              <div className="h-px bg-white/10 lg:h-full" aria-hidden="true" />
              <div className="flex flex-col justify-center rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Known value</p>
                  <MarketValueSourceInfo />
                </div>
                <p className="mt-1 text-2xl font-black text-emerald-300">{formatMarketPrice(totalMarketValue)}</p>
              </div>
              <button type="button" onClick={() => setCollectionHistoryOpen(true)} className="inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-emerald-200 transition hover:border-emerald-200/50 hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-amber-200">
                <TrendingUp size={16} />
                Value history
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === 'inventory' && !session ? (
          <section className="grid justify-items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
            <PackageOpen size={38} className="text-amber-200" />
            <div>
              <h2 className="text-2xl font-black text-white">Sign in to view your inventory</h2>
              <p className="mt-2 text-sm text-slate-400">Your card counts are saved to your KnowLeague account.</p>
            </div>
            <Link href="/login" className="rounded-xl border border-amber-200/40 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200">Sign in</Link>
          </section>
        ) : activeTab === 'inventory' && inventoryLoading ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading your inventory...</section>
        ) : activeTab === 'inventory' && inventoryError ? (
          <section className="rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200">{inventoryError}</section>
        ) : filteredCards.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">
            {activeTab === 'inventory' ? 'Your inventory does not match these filters yet.' : 'No cards match these filters.'}
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredCards.map((card) => (
              <RiftboundCardRow
                key={card.id}
                card={card}
                normalQuantity={getFinishQuantity(inventoryByFinish, card.id, 'normal')}
                foilQuantity={getFinishQuantity(inventoryByFinish, card.id, 'foil')}
                pendingChange={
                  getFinishQuantity(inventoryByFinish, card.id, 'normal') !== getFinishQuantity(savedInventoryByFinish, card.id, 'normal')
                  || getFinishQuantity(inventoryByFinish, card.id, 'foil') !== getFinishQuantity(savedInventoryByFinish, card.id, 'foil')
                }
                pending={inventorySaving}
                onOpen={setSelectedCard}
                onAdjust={adjustInventory}
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
          pending={inventorySaving}
          onClose={() => setSelectedCard(null)}
          onAdjust={adjustInventory}
        />
      ) : null}
      {collectionHistoryOpen && session ? (
        <RiftboundCollectionValueHistoryModal session={session} onClose={() => setCollectionHistoryOpen(false)} />
      ) : null}
      {collectionShareOpen ? (
        <RiftboundCollectionShareModal rows={inventoryRows} onClose={() => setCollectionShareOpen(false)} />
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
