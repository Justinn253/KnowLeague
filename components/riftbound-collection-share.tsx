'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileDown, Info, PackageOpen, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { RIFTBOUND_CARDS, type RiftboundCard, type RiftboundFinish } from '@/lib/riftbound';
import { getRiftboundLatestPrices, type RiftboundLatestPrice } from '@/lib/riftbound-client';

type SharedInventoryRow = {
  card_id: string;
  finish: RiftboundFinish;
  quantity: number;
};

type SharedCard = {
  card: RiftboundCard;
  normal: number;
  foil: number;
};

type SharedSortMode =
  | 'none'
  | 'value-asc'
  | 'value-desc'
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

type SharedFilters = {
  setCode: string[];
  rarity: string[];
  cardType: string[];
  domain: string[];
  energyCost: string[];
  powerCost: string[];
  might: string[];
};

type SharedSnapshot = {
  rows: SharedInventoryRow[];
  kind: 'collection' | 'set';
  title: string;
  createdBy: string;
  createdAt: string;
};

type SharedPriceHistoryEntry = {
  date: string;
  finish: RiftboundFinish;
  price: number | null;
};

const cardById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));
const RIFTBOUND_DRAFT_STORAGE_PREFIX = 'knowleague:riftbound-inventory-draft:';
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const ALL_FILTER_VALUE = 'all';
const emptySharedFilters: SharedFilters = {
  setCode: [ALL_FILTER_VALUE],
  rarity: [ALL_FILTER_VALUE],
  cardType: [ALL_FILTER_VALUE],
  domain: [ALL_FILTER_VALUE],
  energyCost: [ALL_FILTER_VALUE],
  powerCost: [ALL_FILTER_VALUE],
  might: [ALL_FILTER_VALUE],
};
const sharedRarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
const sharedSortOptions: AppSelectOption<SharedSortMode>[] = [
  { value: 'none', label: 'No sort' },
  { value: 'value-asc', label: 'Value · Low to High' },
  { value: 'value-desc', label: 'Value · High to Low' },
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

function formatMarketPrice(value: number | null) {
  return value === null ? 'N/A' : currencyFormatter.format(value);
}

function formatShareCreatedAt(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function compareNullableNumbers(left: number | null, right: number | null, direction: 1 | -1) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}

function compareSharedCards(left: SharedCard, right: SharedCard, mode: SharedSortMode) {
  if (mode === 'none') return 0;
  const direction: 1 | -1 = mode.endsWith('-desc') ? -1 : 1;
  const [field] = mode.split('-');
  const leftQuantity = left.normal + left.foil;
  const rightQuantity = right.normal + right.foil;

  if (field === 'value') {
    return compareNullableNumbers(left.card.marketPrices.foil, right.card.marketPrices.foil, direction);
  }
  if (field === 'name') {
    return left.card.displayName.localeCompare(right.card.displayName) * direction || left.card.id.localeCompare(right.card.id);
  }
  if (field === 'number') {
    return left.card.setCode.localeCompare(right.card.setCode) * direction
      || left.card.collectorNumber.localeCompare(right.card.collectorNumber, undefined, { numeric: true }) * direction
      || left.card.id.localeCompare(right.card.id);
  }
  if (field === 'rarity') {
    return (sharedRarityOrder.indexOf(left.card.rarity) - sharedRarityOrder.indexOf(right.card.rarity)) * direction
      || left.card.displayName.localeCompare(right.card.displayName);
  }
  if (field === 'might') return (left.card.might - right.card.might) * direction || left.card.displayName.localeCompare(right.card.displayName);
  if (field === 'energy') return (left.card.energyCost - right.card.energyCost) * direction || left.card.displayName.localeCompare(right.card.displayName);
  if (field === 'power') return (left.card.powerCost - right.card.powerCost) * direction || left.card.displayName.localeCompare(right.card.displayName);
  if (field === 'quantity') return (leftQuantity - rightQuantity) * direction || left.card.displayName.localeCompare(right.card.displayName);

  return 0;
}

function sharedUniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function sharedJumbledValues(values: string[]) {
  const getSortValue = (value: string) => value.split('').reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) % 100003, 17);
  return [...values].sort((left, right) => getSortValue(left) - getSortValue(right) || left.localeCompare(right));
}

function sharedFilterOptions(values: string[], allLabel: string, getLabel: (value: string) => string = (value) => value): AppSelectOption<string>[] {
  return [{ value: ALL_FILTER_VALUE, label: allLabel }, ...values.map((value) => ({ value, label: getLabel(value) }))];
}

function toggleSharedFilterValue(values: string[], nextValue: string) {
  if (nextValue === ALL_FILTER_VALUE) return [ALL_FILTER_VALUE];
  const selectedValues = values.filter((value) => value !== ALL_FILTER_VALUE);
  const nextValues = selectedValues.includes(nextValue)
    ? selectedValues.filter((value) => value !== nextValue)
    : [...selectedValues, nextValue];
  return nextValues.length > 0 ? nextValues : [ALL_FILTER_VALUE];
}

function matchesSharedFilter(values: string[], candidates: string | string[]) {
  if (values.includes(ALL_FILTER_VALUE)) return true;
  const candidateValues = Array.isArray(candidates) ? candidates : [candidates];
  return values.some((value) => candidateValues.includes(value));
}

function formatSharedHistoryDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function formatSharedHistoryTooltipDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date)} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

function buildSharedHistorySegments(values: Array<number | null>, getX: (index: number) => number, getY: (value: number) => number) {
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

type SharedHistoryTooltip = {
  x: number;
  y: number;
  label: string;
  value: string;
  date: string;
};

function SharedHistoryChartTooltip({ point }: { point: SharedHistoryTooltip }) {
  const placeBelow = point.y < 70;
  const horizontalAlignment = point.x / 720 <= 0.18
    ? 'start'
    : point.x / 720 >= 0.82
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
      style={{ left: `${(point.x / 720) * 100}%`, top: `${(point.y / 250) * 100}%`, marginTop: placeBelow ? '0.5rem' : '-0.5rem' }}
      role="status"
    >
      <p className="whitespace-nowrap font-black text-amber-200">{point.value} - {point.date}</p>
      <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">{point.label}</p>
    </div>
  );
}

function SharedPriceHistoryChart({ history }: { history: SharedPriceHistoryEntry[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<SharedHistoryTooltip | null>(null);
  const dates = Array.from(new Set(history.map((entry) => entry.date))).sort();
  const valuesByKey = new Map(history.map((entry) => [`${entry.date}:${entry.finish}`, entry.price]));
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
  const maxPrice = Math.max(...prices, 0.01);
  const getX = (index: number) => dates.length === 1 ? plotLeft + ((plotRight - plotLeft) / 2) : plotLeft + ((index / (dates.length - 1)) * (plotRight - plotLeft));
  const getY = (value: number) => plotBottom - ((value / maxPrice) * (plotBottom - plotTop));
  const labelIndexes = Array.from(new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]));

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/50 p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((entry) => <span key={entry.finish} className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />{entry.label}</span>)}
        </div>
        <span className="text-[0.65rem] font-semibold text-slate-500">USD per card</span>
      </div>
      <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Riftbound card market value history line graph" className="h-auto min-w-[36rem] w-full">
        {[maxPrice, maxPrice / 2, 0].map((value) => {
          const y = getY(value);
          return <g key={value}><line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" /><text x={plotLeft - 10} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">{formatMarketPrice(value)}</text></g>;
        })}
        <line x1={plotLeft} x2={plotRight} y1={plotBottom} y2={plotBottom} stroke="rgba(148,163,184,0.3)" />
        {series.map((entry) => buildSharedHistorySegments(entry.values, getX, getY).map((points, index) => <polyline key={`${entry.finish}-${index}`} points={points} fill="none" stroke={entry.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />))}
        {series.flatMap((entry) => entry.values.map((value, index) => value === null ? null : (() => {
          const point = {
            x: getX(index),
            y: getY(value),
            label: entry.label,
            value: formatMarketPrice(value),
            date: formatSharedHistoryTooltipDate(dates[index]),
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
        {labelIndexes.map((index) => <text key={index} x={getX(index)} y={plotBottom + 25} textAnchor="middle" fill="#64748b" fontSize="11">{formatSharedHistoryDate(dates[index])}</text>)}
      </svg>
      {hoveredPoint ? <SharedHistoryChartTooltip point={hoveredPoint} /> : null}
      </div>
    </div>
  );
}

function SharedDetailValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className="mt-1 truncate text-xs font-bold text-slate-200" title={value}>{value}</dd></div>;
}

function SharedMarketValueSourceInfo() {
  return <span className="group relative inline-flex align-middle"><Info size={14} tabIndex={0} aria-label="Market value source information" className="text-slate-500 outline-none transition group-hover:text-amber-200 group-focus-within:text-amber-200" /><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-200 group-hover:block group-focus-within:block">Estimated from captured market prices provided by our pricing source. It is not a guaranteed sale price. Daily refresh at 6:00 AM EST.</span></span>;
}

function SharedCardDetailsModal({ card, onClose }: { card: RiftboundCard; onClose: () => void }) {
  const [history, setHistory] = useState<SharedPriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const rarityClassName = ({ Common: 'text-slate-300', Uncommon: 'text-blue-300', Rare: 'text-violet-300', Epic: 'text-amber-300', Showcase: 'text-yellow-200' } as Record<string, string>)[card.rarity] ?? 'text-slate-300';

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError('');
    void fetch(`/api/riftbound/prices/${encodeURIComponent(card.id)}?days=30`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { history?: SharedPriceHistoryEntry[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load market value history.');
        if (!cancelled) setHistory(data.history ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Unable to load market value history.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [card.id]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4" onPointerDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${card.displayName} details`} className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 sm:max-h-[calc(100dvh-2rem)]" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close card details" onClick={onClose} className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={18} /></button>
        <div className="grid gap-6 p-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-7">
          <div className="grid content-start justify-items-center gap-3 sm:justify-items-start">
            <div className="relative aspect-[744/1039] w-56 overflow-hidden rounded-2xl bg-slate-900"><RiftboundCardImage card={card} sizes="224px" className="object-cover" /></div>
            <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-center text-xs font-black uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">View Official Card <ExternalLink size={14} /></a>
          </div>
          <div className="grid min-w-0 gap-5">
            <div className="min-w-0 pr-14"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{card.setName} · {card.setCode} {card.numberLabel}</p><h2 className="mt-2 text-3xl font-black tracking-tight text-white">{card.displayName}</h2><p className={`mt-2 text-sm font-black ${rarityClassName}`}>{card.rarity}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['normal', 'foil'] as const).map((finish) => <div key={finish} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{finish} market value</p><SharedMarketValueSourceInfo /></div><p className="mt-1 text-2xl font-black text-emerald-300">{card.finishOptions.includes(finish) ? formatMarketPrice(card.marketPrices[finish]) : 'N/A'}</p><p className="mt-2 text-xs text-slate-500">{card.marketPrices.updatedAt ? 'Latest daily snapshot' : 'No price available'}</p><p className="mt-2 text-[0.65rem] font-semibold text-slate-500">Daily refresh at 6:00 AM EST.</p></div>)}
            </div>
            <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-3">
              <SharedDetailValue label="Number" value={`${card.setCode} ${card.numberLabel}`} /><SharedDetailValue label="Tag" value={card.tags.join('; ') || 'N/A'} /><SharedDetailValue label="Energy" value={String(card.energyCost)} />
              <SharedDetailValue label="Card Type" value={card.cardTypeLabels.join('; ')} /><SharedDetailValue label="Finish Options" value={card.finishOptions.join('; ')} /><SharedDetailValue label="Power" value={String(card.powerCost)} />
              <SharedDetailValue label="Domain" value={card.domains.join('; ') || 'Colorless'} /><SharedDetailValue label="Artist" value={card.artist || 'N/A'} /><SharedDetailValue label="Might" value={String(card.might)} />
            </dl>
            <div className="border-t border-white/10 pt-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Product Details</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{card.productDetails}</p></div>
            <div className="border-t border-white/10 pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Value History</p><span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-600">Last 30 days</span></div><div className="mt-3">{historyLoading ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-5 text-sm text-slate-500">Loading market history...</p> : historyError ? <p className="rounded-2xl border border-red-300/10 bg-red-950/20 px-4 py-5 text-sm text-red-200">{historyError}</p> : <SharedPriceHistoryChart history={history} />}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function stageSharedRowsInInventoryDraft(userId: string, sharedRows: SharedInventoryRow[]) {
  const storageKey = `${RIFTBOUND_DRAFT_STORAGE_PREFIX}${userId}`;
  const quantities = new Map<string, { card_id: string; finish: RiftboundFinish; quantity: number; updated_at: string }>();
  let savedRows: Array<{ card_id: string; finish: RiftboundFinish; quantity: number; updated_at: string }> = [];

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (rawValue) {
      const parsedValue: unknown = JSON.parse(rawValue);
      const draft = parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
        ? parsedValue as { rows?: unknown; savedRows?: unknown }
        : { rows: Array.isArray(parsedValue) ? parsedValue : [], savedRows: [] };
      const existingRows = Array.isArray(draft.rows) ? draft.rows : [];
      existingRows.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const candidate = item as { card_id?: unknown; finish?: unknown; quantity?: unknown; updated_at?: unknown };
        if (
          typeof candidate.card_id !== 'string'
          || !cardById.has(candidate.card_id)
          || (candidate.finish !== 'normal' && candidate.finish !== 'foil')
          || typeof candidate.quantity !== 'number'
          || !Number.isInteger(candidate.quantity)
          || candidate.quantity <= 0
        ) return;
        const key = `${candidate.card_id}:${candidate.finish}`;
        quantities.set(key, {
          card_id: candidate.card_id,
          finish: candidate.finish,
          quantity: candidate.quantity,
          updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : new Date().toISOString(),
        });
      });

      const storedSavedRows = Array.isArray(draft.savedRows) ? draft.savedRows : [];
      savedRows = storedSavedRows.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as { card_id?: unknown; finish?: unknown; quantity?: unknown; updated_at?: unknown };
        if (
          typeof candidate.card_id !== 'string'
          || !cardById.has(candidate.card_id)
          || (candidate.finish !== 'normal' && candidate.finish !== 'foil')
          || typeof candidate.quantity !== 'number'
          || !Number.isInteger(candidate.quantity)
          || candidate.quantity <= 0
        ) return [];
        return [{
          card_id: candidate.card_id,
          finish: candidate.finish,
          quantity: candidate.quantity,
          updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : new Date().toISOString(),
        }];
      });
    }

    const updatedAt = new Date().toISOString();
    sharedRows.forEach((row) => {
      const key = `${row.card_id}:${row.finish}`;
      const current = quantities.get(key);
      quantities.set(key, {
        card_id: row.card_id,
        finish: row.finish,
        quantity: (current?.quantity ?? 0) + row.quantity,
        updated_at: updatedAt,
      });
    });

    window.localStorage.setItem(storageKey, JSON.stringify({ rows: Array.from(quantities.values()), savedRows }));
  } catch {
    throw new Error('Unable to save these cards to your pending inventory. Please check that browser storage is available.');
  }
}

async function printCollection() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('.riftbound-print-card-image'));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 5000);
      const finish = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    });
  }));
  window.print();
}

function decodeShareBytes(value: string) {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(normalizedValue);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readShareVarUint(bytes: Uint8Array, cursor: { index: number }) {
  let value = 0;
  let multiplier = 1;
  for (let count = 0; count < 6; count += 1) {
    const nextByte = bytes[cursor.index++];
    if (nextByte === undefined) throw new Error('Invalid compact share link.');
    value += (nextByte & 0x7f) * multiplier;
    if ((nextByte & 0x80) === 0) return value;
    multiplier *= 128;
  }
  throw new Error('Invalid compact share link.');
}

function readShareString(bytes: Uint8Array, cursor: { index: number }) {
  const length = readShareVarUint(bytes, cursor);
  const end = cursor.index + length;
  if (end > bytes.length) throw new Error('Invalid compact share link.');
  const value = new TextDecoder().decode(bytes.slice(cursor.index, end));
  cursor.index = end;
  return value;
}

function decodeBinaryShareSnapshot(bytes: Uint8Array): SharedSnapshot {
  const cursor = { index: 0 };
  if (bytes[cursor.index++] !== 3) throw new Error('Unsupported compact share link.');
  const kindByte = bytes[cursor.index++];
  if (kindByte !== 0 && kindByte !== 1) throw new Error('Invalid compact share link.');
  const title = readShareString(bytes, cursor);
  const createdBy = readShareString(bytes, cursor);
  const createdAtSeconds = readShareVarUint(bytes, cursor);
  const rowCount = readShareVarUint(bytes, cursor);
  if (rowCount > 5000) throw new Error('Invalid compact share link.');

  let previousKey = 0;
  const rows: SharedInventoryRow[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const key = previousKey + readShareVarUint(bytes, cursor);
    const quantity = readShareVarUint(bytes, cursor);
    const cardIndex = Math.floor(key / 2);
    const card = RIFTBOUND_CARDS[cardIndex];
    const finish: RiftboundFinish = key % 2 === 1 ? 'foil' : 'normal';
    if (!card || !card.finishOptions.includes(finish) || quantity <= 0 || quantity > 100000) throw new Error('Invalid compact share link.');
    rows.push({ card_id: card.id, finish, quantity });
    previousKey = key;
  }

  return {
    rows,
    kind: kindByte === 1 ? 'set' : 'collection',
    title,
    createdBy,
    createdAt: createdAtSeconds > 0 ? new Date(createdAtSeconds * 1000).toISOString() : '',
  };
}

async function decodeRows(value: string): Promise<SharedSnapshot> {
  try {
    const separatorIndex = value.indexOf('.');
    const encoding = separatorIndex === -1 ? '' : value.slice(0, separatorIndex);
    const encodedValue = separatorIndex === -1 ? value : value.slice(separatorIndex + 1);
    let bytes = decodeShareBytes(encodedValue);
    if (encoding === 'b') return decodeBinaryShareSnapshot(bytes);
    if (encoding === 'g') {
      if (typeof DecompressionStream === 'undefined') throw new Error('Compressed share links are not supported in this browser.');
      const decompressedStream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      bytes = new Uint8Array(await new Response(decompressedStream).arrayBuffer());
    }

    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const payload = Array.isArray(parsed)
      ? { rows: parsed, kind: 'collection' as const, title: '', createdBy: '', createdAt: '' }
      : parsed && typeof parsed === 'object'
        ? parsed as { rows?: unknown; r?: unknown; kind?: unknown; k?: unknown; title?: unknown; t?: unknown; createdBy?: unknown; u?: unknown; createdAt?: unknown; d?: unknown }
        : null;
    const rawRows = Array.isArray(payload?.r) ? payload.r : payload?.rows;
    if (!payload || !Array.isArray(rawRows)) return { rows: [], kind: 'collection', title: '', createdBy: '', createdAt: '' };

    const rows = rawRows.flatMap((item): SharedInventoryRow[] => {
      let cardId: unknown;
      let finish: unknown;
      let quantity: unknown;
      if (Array.isArray(item)) {
        [cardId, finish, quantity] = item;
        finish = finish === 1 ? 'foil' : finish === 0 ? 'normal' : finish;
      } else if (item && typeof item === 'object') {
        const candidate = item as Partial<SharedInventoryRow>;
        cardId = candidate.card_id;
        finish = candidate.finish;
        quantity = candidate.quantity;
      }

      const card = typeof cardId === 'string' ? cardById.get(cardId) : null;
      if (!card || (finish !== 'normal' && finish !== 'foil') || !card.finishOptions.includes(finish) || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) return [];
      return [{ card_id: card.id, finish, quantity }];
    });
    return {
      rows,
      kind: payload.k === 's' || payload.kind === 'set' ? 'set' : 'collection',
      title: typeof payload.t === 'string' ? payload.t : typeof payload.title === 'string' ? payload.title : '',
      createdBy: typeof payload.u === 'string' ? payload.u : typeof payload.createdBy === 'string' ? payload.createdBy : '',
      createdAt: typeof payload.d === 'string' ? payload.d : typeof payload.createdAt === 'string' ? payload.createdAt : '',
    };
  } catch {
    return { rows: [], kind: 'collection', title: '', createdBy: '', createdAt: '' };
  }
}

export function RiftboundCollectionShare() {
  const [snapshot, setSnapshot] = useState<SharedSnapshot>({ rows: [], kind: 'collection', title: '', createdBy: '', createdAt: '' });
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SharedSortMode>('value-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SharedFilters>(emptySharedFilters);
  const [tagQuery, setTagQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [inventoryError, setInventoryError] = useState('');
  const [latestPrices, setLatestPrices] = useState<Record<string, RiftboundLatestPrice>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = params.get('d') ?? params.get('data');
    void (data ? decodeRows(data) : Promise.resolve({ rows: [], kind: 'collection' as const, title: '', createdBy: '', createdAt: '' }))
      .then(setSnapshot);
  }, []);

  useEffect(() => subscribeToAuthSession((nextSession) => {
    setSession(nextSession);
    setAuthResolved(true);
  }), []);

  useEffect(() => {
    let cancelled = false;
    void getRiftboundLatestPrices()
      .then((data) => {
        if (!cancelled) setLatestPrices(data.prices ?? {});
      })
      .catch(() => {
        // The catalogue values remain a safe fallback if the latest snapshot is unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  const { rows } = snapshot;

  const cards = useMemo(() => {
    const quantities = new Map<string, { normal: number; foil: number }>();
    rows.forEach((row) => {
      const current = quantities.get(row.card_id) ?? { normal: 0, foil: 0 };
      current[row.finish] += row.quantity;
      quantities.set(row.card_id, current);
    });

    return Array.from(quantities.entries())
      .flatMap(([cardId, quantitiesForCard]): SharedCard[] => {
        const card = cardById.get(cardId);
        if (!card) return [];
        const latest = latestPrices[card.id];
        const currentCard = latest ? {
          ...card,
          marketPrice: latest.normal,
          marketPriceUpdatedAt: latest.updatedAt,
          marketPrices: { ...card.marketPrices, normal: latest.normal, foil: latest.foil, updatedAt: latest.updatedAt },
        } : card;
        return [{ card: currentCard, ...quantitiesForCard }];
      })
      .sort((left, right) => left.card.displayName.localeCompare(right.card.displayName));
  }, [latestPrices, rows]);

  useEffect(() => {
    if (!selectedCard) return;
    const currentCard = cards.find(({ card }) => card.id === selectedCard.id)?.card;
    if (currentCard && currentCard !== selectedCard) setSelectedCard(currentCard);
  }, [cards, selectedCard]);

  const totalCopies = cards.reduce((total, entry) => total + entry.normal + entry.foil, 0);
  const totalValue = cards.reduce((total, entry) => total
    + ((entry.card.marketPrices.normal ?? 0) * entry.normal)
    + ((entry.card.marketPrices.foil ?? 0) * entry.foil), 0);
  const filterOptionsByField = useMemo(() => {
    const setNames = new Map(cards.map(({ card }) => [card.setCode, card.setName]));
    return {
      setCode: sharedFilterOptions(sharedJumbledValues(sharedUniqueSorted(cards.map(({ card }) => card.setCode))), 'All Sets', (setCode) => `${setCode} - ${setNames.get(setCode) ?? setCode}`),
      rarity: sharedFilterOptions(sharedRarityOrder.filter((rarity) => cards.some(({ card }) => card.rarity === rarity)), 'All Rarities'),
      cardType: sharedFilterOptions(sharedJumbledValues(sharedUniqueSorted(cards.map(({ card }) => card.cardType))), 'All Card Types'),
      domain: sharedFilterOptions(['Colorless', 'Body', 'Mind', 'Order', 'Chaos', 'Calm', 'Fury'].filter((domain) => cards.some(({ card }) => card.domains.includes(domain))), 'All Domains'),
      energyCost: sharedFilterOptions(sharedJumbledValues(sharedUniqueSorted(cards.map(({ card }) => String(card.energyCost)))), 'All Energy Costs'),
      powerCost: sharedFilterOptions(sharedJumbledValues(sharedUniqueSorted(cards.map(({ card }) => String(card.powerCost)))), 'All Power Costs'),
      might: sharedFilterOptions(sharedJumbledValues(sharedUniqueSorted(cards.map(({ card }) => String(card.might)))), 'All Might Values'),
    };
  }, [cards]);
  const deferredQuery = useDeferredValue(query);
  const deferredTagQuery = useDeferredValue(tagQuery);
  const activeFilterCount = Object.values(filters).reduce(
    (total, values) => total + values.filter((value) => value !== ALL_FILTER_VALUE).length,
    0,
  ) + (tagQuery.trim() ? 1 : 0);
  const filteredCards = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery);
    const normalizedTagQuery = normalizeSearchText(deferredTagQuery);
    return cards
      .filter(({ card }) => {
        if (!matchesSharedFilter(filters.setCode, card.setCode)) return false;
        if (!matchesSharedFilter(filters.rarity, card.rarity)) return false;
        if (!matchesSharedFilter(filters.cardType, card.cardType)) return false;
        if (!matchesSharedFilter(filters.domain, card.domains)) return false;
        if (!matchesSharedFilter(filters.energyCost, String(card.energyCost))) return false;
        if (!matchesSharedFilter(filters.powerCost, String(card.powerCost))) return false;
        if (!matchesSharedFilter(filters.might, String(card.might))) return false;
        if (normalizedTagQuery && !card.tags.some((tag) => normalizeSearchText(tag).includes(normalizedTagQuery))) return false;
        if (!normalizedQuery) return true;
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
        ].join(' ')).includes(normalizedQuery);
      })
      .sort((left, right) => compareSharedCards(left, right, sortMode));
  }, [cards, deferredQuery, deferredTagQuery, filters, sortMode]);

  const toggleFilter = (field: keyof SharedFilters, value: string) => {
    setFilters((current) => ({ ...current, [field]: toggleSharedFilterValue(current[field], value) }));
  };

  const resetFilters = () => {
    setFilters(emptySharedFilters);
    setTagQuery('');
  };

  const addToInventory = () => {
    if (!session || rows.length === 0) return;

    setInventoryError('');
    try {
      stageSharedRowsInInventoryDraft(session.user.id, rows);
      window.location.assign('/inventory?tab=inventory');
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to add these cards to your pending inventory.');
    }
  };

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10 print:bg-white print:px-2 print:py-2 print:text-black">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 print:max-w-none print:gap-2">
        <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7 print:rounded-lg print:border-slate-300 print:bg-white print:p-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300 print:text-amber-700">Riftbound {snapshot.kind}</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white print:text-lg print:text-black">{snapshot.title || (snapshot.kind === 'set' ? 'Shared set snapshot' : 'Shared collection snapshot')}</h1>
              <p className="mt-2 text-sm text-slate-400 print:mt-1 print:text-[9px] print:text-slate-600">{cards.length} unique cards · {totalCopies} total cards · known value {formatMarketPrice(totalValue)}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500 print:mt-1 print:text-[8px] print:text-slate-600">
                <span>Shared by <strong className="text-slate-300 print:text-slate-700">{snapshot.createdBy || 'Unknown user'}</strong></span>
                <span>Created {formatShareCreatedAt(snapshot.createdAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link href="/inventory" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><ArrowLeft size={14} /> Inventory</Link>
              <button type="button" onClick={() => void printCollection()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200"><FileDown size={14} /> Print / Save PDF</button>
            </div>
          </div>
          {cards.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 print:hidden">
              {authResolved && session ? (
                <button type="button" onClick={addToInventory} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200">
                  <Plus size={15} /> Add to pending inventory
                </button>
              ) : authResolved ? (
                <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200"><Plus size={15} /> Log in to add to inventory</Link>
              ) : null}
              {inventoryError ? <p role="alert" className="text-sm font-semibold text-red-200">{inventoryError}</p> : null}
            </div>
          ) : null}
          <p className="mt-5 max-w-3xl text-xs leading-5 text-slate-500 print:hidden">Values are estimated from captured market prices provided by our pricing source and are not guaranteed sale prices. This read-only link is a snapshot of the collection at the time it was created.</p>
        </header>

        {cards.length > 0 ? (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 print:hidden sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem_auto]">
              <label className="relative block">
                <span className="sr-only">Search shared {snapshot.kind}</span>
                <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="search"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 pl-11 pr-11 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm"
                />
                {query ? (
                  <button type="button" aria-label="Clear shared collection search" onClick={() => setQuery('')} className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white">
                    <X size={16} />
                  </button>
                ) : null}
              </label>
              <AppSelectMenu
                label="Sort"
                value={sortMode}
                options={sharedSortOptions}
                onChange={setSortMode}
                triggerClassName="h-12"
                hideLabel
              />
              <button
                type="button"
                aria-label="Open shared card filters"
                aria-expanded={filtersOpen}
                title="Open card filters"
                onClick={() => setFiltersOpen((open) => !open)}
                className={`inline-flex h-12 w-12 items-center justify-center gap-1 rounded-2xl border text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 ${filtersOpen || activeFilterCount > 0 ? 'border-amber-200/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900'}`}
              >
                <SlidersHorizontal size={18} />
                {activeFilterCount > 0 ? <span className="-mr-2 -mt-6 rounded-md bg-slate-950 px-1.5 py-0.5 text-[0.65rem] text-amber-200">{activeFilterCount}</span> : null}
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
                <div className="flex items-end justify-end md:col-span-3">
                  <button type="button" onClick={resetFilters} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/25 hover:text-white">Reset Filters</button>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">Showing {filteredCards.length} of {cards.length} unique cards</p>
          </section>
        ) : null}

        {cards.length === 0 ? (
          <section className="grid justify-items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center print:border-slate-300 print:bg-white">
            <PackageOpen size={38} className="text-amber-200 print:text-amber-700" />
            <p className="text-sm font-semibold text-slate-400 print:text-slate-600">This collection link is empty or no longer valid.</p>
          </section>
        ) : filteredCards.length === 0 ? (
          <section className="grid justify-items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center print:hidden">
            <Search size={38} className="text-amber-200" />
            <p className="text-sm font-semibold text-slate-400">No cards match your search.</p>
            <button type="button" onClick={() => setQuery('')} className="rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200">Clear search</button>
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
            {filteredCards.map(({ card, normal, foil }) => (
              <article key={card.id} className="flex min-w-0 break-inside-avoid flex-col rounded-2xl border border-white/10 bg-slate-950/80 p-4 print:rounded-lg print:border-slate-300 print:bg-white print:p-2">
                <button type="button" onClick={() => setSelectedCard(card)} className="flex min-w-0 flex-1 flex-col items-center text-center focus:outline-none focus:ring-2 focus:ring-amber-200 focus:ring-offset-2 focus:ring-offset-slate-950 print:pointer-events-none">
                <h2 className="w-full truncate text-center text-lg font-black text-white print:text-[10px] print:leading-tight print:text-black" title={card.displayName}>{card.displayName}</h2>
                <p className="mt-1 text-center text-xs font-bold uppercase tracking-[0.1em] text-slate-500 print:mt-0.5 print:text-[8px] print:text-slate-600">{card.setCode} · {card.numberLabel}</p>
                <div className="relative mx-auto mt-3 aspect-[744/1039] w-full max-w-[11rem] overflow-hidden rounded-xl bg-slate-900 print:mt-1 print:max-w-[4.5rem] print:rounded print:bg-slate-100">
                  <RiftboundCardImage card={card} sizes="176px" loading="eager" className="riftbound-print-card-image object-cover" />
                </div>
                </button>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-400 print:mt-1 print:gap-0.5 print:text-[8px] print:text-slate-600">
                  {card.finishOptions.includes('normal') ? <p className="flex justify-between gap-2"><span>Normal · {normal}</span><span>{formatMarketPrice(card.marketPrices.normal)}</span></p> : null}
                  {card.finishOptions.includes('foil') ? <p className="flex justify-between gap-2 text-amber-200 print:text-amber-700"><span>Foil · {foil}</span><span>{formatMarketPrice(card.marketPrices.foil)}</span></p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
        {selectedCard ? <SharedCardDetailsModal card={selectedCard} onClose={() => setSelectedCard(null)} /> : null}
      </div>
    </main>
  );
}
