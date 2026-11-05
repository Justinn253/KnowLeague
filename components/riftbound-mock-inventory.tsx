'use client';

import Link from 'next/link';
import { LoaderCircle, PackageOpen, RefreshCw, RotateCcw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getRiftboundCardRarityTextClass, RIFTBOUND_CARDS, RIFTBOUND_RARITY_ORDER, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundMockInventory, invalidateRiftboundMockInventory } from '@/lib/riftbound-client';
import type { RiftboundMockInventoryItem, RiftboundMockSealedProduct, RiftboundMockTreatment } from '@/lib/riftbound-mock-inventory';

type MockInventorySortMode =
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

type MockInventoryFilters = {
  cardType: string[];
  domain: string[];
  energyCost: string[];
  maxPrice: string;
  might: string[];
  minPrice: string;
  powerCost: string[];
  rarity: string[];
  setCode: string[];
};

type MockInventoryFilterField = Exclude<keyof MockInventoryFilters, 'minPrice' | 'maxPrice'>;
type MockInventoryDisplayItem = RiftboundMockInventoryItem & { card: RiftboundCard };

const ALL_FILTER_VALUE = 'all';
const DEFAULT_SORT_MODE: MockInventorySortMode = 'market-desc';
const FILTER_FIELDS: MockInventoryFilterField[] = ['setCode', 'rarity', 'cardType', 'domain', 'energyCost', 'powerCost', 'might'];

const EMPTY_FILTERS: MockInventoryFilters = {
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

const SORT_OPTIONS: AppSelectOption<MockInventorySortMode>[] = [
  { value: 'market-asc', label: 'Value · Low to High' },
  { value: 'market-desc', label: 'Value · High to Low' },
  { value: 'name-asc', label: 'Name · A to Z' },
  { value: 'name-desc', label: 'Name · Z to A' },
  { value: 'number-asc', label: 'Number · Low to High' },
  { value: 'number-desc', label: 'Number · High to Low' },
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

const TREATMENT_LABELS: Record<RiftboundMockTreatment, string> = {
  standard: 'Standard',
  alt_art: 'Alt Art',
  special_alt: 'Special Alt',
  overnumbered: 'Overnumbered',
  signature: 'Signature',
  ultimate: 'Ultimate Rare',
};

const TREATMENT_ORDER: Record<RiftboundMockTreatment, number> = {
  standard: 0,
  alt_art: 1,
  special_alt: 2,
  overnumbered: 3,
  signature: 4,
  ultimate: 5,
};

function pluralize(value: number, singular: string) {
  return `${value.toLocaleString()} ${value === 1 ? singular : `${singular}s`}`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function filterOptions(values: string[], allLabel: string, labelForValue: (value: string) => string = (value) => value): AppSelectOption<string>[] {
  return [
    { value: ALL_FILTER_VALUE, label: allLabel },
    ...values.map((value) => ({ value, label: labelForValue(value) })),
  ];
}

function toggleFilterValue(values: string[], value: string) {
  if (value === ALL_FILTER_VALUE) return [ALL_FILTER_VALUE];
  const current = values.filter((entry) => entry !== ALL_FILTER_VALUE);
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  return next.length > 0 ? next : [ALL_FILTER_VALUE];
}

function matchesFilter(values: string[], candidates: string | string[]) {
  if (values.includes(ALL_FILTER_VALUE)) return true;
  const candidateValues = Array.isArray(candidates) ? candidates : [candidates];
  return values.some((value) => candidateValues.includes(value));
}

function parsePrice(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function matchesPriceRange(item: MockInventoryDisplayItem, minimumInput: string, maximumInput: string) {
  const minimum = parsePrice(minimumInput);
  const maximum = parsePrice(maximumInput);
  if (minimum === null && maximum === null) return true;
  if (minimum !== null && maximum !== null && minimum > maximum) return false;
  const price = item.card.marketPrices[item.finish];
  return price !== null && (minimum === null || price >= minimum) && (maximum === null || price <= maximum);
}

function getSearchableText(item: MockInventoryDisplayItem) {
  const { card } = item;
  return normalizeSearchText([
    card.displayName,
    card.collectorNumber,
    card.numberLabel,
    card.setCode,
    card.setName,
    card.rarity,
    card.cardType,
    card.cardTypeLabels.join(' '),
    card.domains.join(' '),
    card.tags.join(' '),
    card.productDetails,
    card.artist ?? '',
    item.finish,
    TREATMENT_LABELS[item.treatment],
  ].join(' '));
}

function compareMockInventoryItems(left: MockInventoryDisplayItem, right: MockInventoryDisplayItem, mode: MockInventorySortMode) {
  const direction: 1 | -1 = mode.endsWith('-desc') ? -1 : 1;
  const [field] = mode.split('-');
  const leftPrice = left.card.marketPrices[left.finish];
  const rightPrice = right.card.marketPrices[right.finish];
  const compareNullableNumbers = (first: number | null, second: number | null) => {
    if (first === null && second === null) return 0;
    if (first === null) return 1;
    if (second === null) return -1;
    return (first - second) * direction;
  };

  let comparison = 0;
  if (field === 'market') comparison = compareNullableNumbers(leftPrice, rightPrice);
  else if (field === 'name') comparison = left.card.displayName.localeCompare(right.card.displayName) * direction;
  else if (field === 'number') comparison = left.card.collectorNumber.localeCompare(right.card.collectorNumber, undefined, { numeric: true }) * direction;
  else if (field === 'rarity') comparison = (RIFTBOUND_RARITY_ORDER.indexOf(left.card.rarity as typeof RIFTBOUND_RARITY_ORDER[number]) - RIFTBOUND_RARITY_ORDER.indexOf(right.card.rarity as typeof RIFTBOUND_RARITY_ORDER[number])) * direction;
  else if (field === 'might') comparison = (left.card.might - right.card.might) * direction;
  else if (field === 'energy') comparison = (left.card.energyCost - right.card.energyCost) * direction;
  else if (field === 'power') comparison = (left.card.powerCost - right.card.powerCost) * direction;
  else if (field === 'quantity') comparison = (left.quantity - right.quantity) * direction;

  return comparison
    || TREATMENT_ORDER[right.treatment] - TREATMENT_ORDER[left.treatment]
    || left.card.displayName.localeCompare(right.card.displayName)
    || left.finish.localeCompare(right.finish);
}

export function RiftboundMockInventory({ active, session }: { active: boolean; session: Session | null }) {
  const [items, setItems] = useState<RiftboundMockInventoryItem[]>([]);
  const [sealedProducts, setSealedProducts] = useState<RiftboundMockSealedProduct[]>([]);
  const [totalOpenedPacks, setTotalOpenedPacks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<MockInventorySortMode>(DEFAULT_SORT_MODE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<MockInventoryFilters>(EMPTY_FILTERS);
  const loadedUserIdRef = useRef<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const cardsById = useMemo(() => new Map(RIFTBOUND_CARDS.map((card) => [card.id, card])), []);

  const loadInventory = useCallback(async (force = false) => {
    if (!session) {
      loadedUserIdRef.current = null;
      setItems([]);
      setSealedProducts([]);
      setTotalOpenedPacks(0);
      setLoading(false);
      setError('');
      return;
    }

    if (force) invalidateRiftboundMockInventory(session);
    setLoading(true);
    setError('');
    try {
      const payload = await getRiftboundMockInventory(session);
      setItems(payload.items ?? []);
      setSealedProducts(payload.sealedProducts ?? []);
      setTotalOpenedPacks(payload.totalOpenedPacks ?? 0);
      loadedUserIdRef.current = session.user.id;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your mock inventory.');
      setItems([]);
      setSealedProducts([]);
      setTotalOpenedPacks(0);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      loadedUserIdRef.current = null;
      setItems([]);
      setSealedProducts([]);
      setTotalOpenedPacks(0);
      setLoading(false);
      setError('');
      return;
    }
    if (!active || loadedUserIdRef.current === session.user.id) return;
    void loadInventory();
  }, [active, loadInventory, session]);

  const displayItems = useMemo(() => items.flatMap((item): MockInventoryDisplayItem[] => {
    const card = cardsById.get(item.card_id);
    return card ? [{ ...item, card }] : [];
  }), [cardsById, items]);
  const filterOptionsByField = useMemo(() => {
    const setNames = new Map(displayItems.map((item) => [item.card.setCode, item.card.setName]));
    return {
      setCode: filterOptions(uniqueSorted(displayItems.map((item) => item.card.setCode)), 'All Sets', (setCode) => `${setCode} - ${setNames.get(setCode) ?? setCode}`),
      rarity: filterOptions(RIFTBOUND_RARITY_ORDER.filter((rarity) => displayItems.some((item) => item.card.rarity === rarity)), 'All Rarities'),
      cardType: filterOptions(uniqueSorted(displayItems.map((item) => item.card.cardType)), 'All Card Types'),
      domain: filterOptions(uniqueSorted(displayItems.flatMap((item) => item.card.domains)), 'All Domains'),
      energyCost: filterOptions(uniqueSorted(displayItems.map((item) => String(item.card.energyCost))), 'All Energy Costs'),
      powerCost: filterOptions(uniqueSorted(displayItems.map((item) => String(item.card.powerCost))), 'All Power Costs'),
      might: filterOptions(uniqueSorted(displayItems.map((item) => String(item.card.might))), 'All Might Values'),
    };
  }, [displayItems]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery.trim());
    return displayItems
      .filter((item) => {
        if (!matchesFilter(filters.setCode, item.card.setCode)) return false;
        if (!matchesFilter(filters.rarity, item.card.rarity)) return false;
        if (!matchesFilter(filters.cardType, item.card.cardType)) return false;
        if (!matchesFilter(filters.domain, item.card.domains)) return false;
        if (!matchesFilter(filters.energyCost, String(item.card.energyCost))) return false;
        if (!matchesFilter(filters.powerCost, String(item.card.powerCost))) return false;
        if (!matchesFilter(filters.might, String(item.card.might))) return false;
        if (!matchesPriceRange(item, filters.minPrice, filters.maxPrice)) return false;
        return !normalizedQuery || getSearchableText(item).includes(normalizedQuery);
      })
      .sort((left, right) => compareMockInventoryItems(left, right, sortMode));
  }, [deferredQuery, displayItems, filters, sortMode]);
  const totalCards = items.reduce((total, item) => total + item.quantity, 0);
  const totalPacks = sealedProducts.reduce((total, item) => total + item.pack_quantity, 0);
  const totalBoxes = sealedProducts.reduce((total, item) => total + item.box_quantity, 0);
  const activeFilterCount = FILTER_FIELDS.reduce((total, field) => total + filters[field].filter((value) => value !== ALL_FILTER_VALUE).length, 0)
    + (filters.minPrice.trim() ? 1 : 0)
    + (filters.maxPrice.trim() ? 1 : 0);

  const toggleFilter = useCallback((field: MockInventoryFilterField, value: string) => {
    setFilters((current) => ({ ...current, [field]: toggleFilterValue(current[field], value) }));
  }, []);
  const resetFilters = useCallback(() => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
  }, []);

  if (!session) {
    return (
      <section className="grid justify-items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
        <PackageOpen size={38} className="text-violet-200" />
        <div>
          <h2 className="text-2xl font-black text-white">Sign in to view your mock inventory</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Mock Riftbound cards opened through KnowLeague are saved separately from your real collection tracker.</p>
        </div>
        <Link href="/login" className="rounded-xl border border-violet-200/40 bg-violet-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-violet-200">Sign in</Link>
      </section>
    );
  }

  if (loading) {
    return <section className="flex min-h-56 items-center justify-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-sm font-semibold text-slate-400"><LoaderCircle size={18} className="animate-spin" /> Loading your mock inventory...</section>;
  }

  if (error) {
    return (
      <section className="grid justify-items-center gap-4 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center">
        <p className="text-sm font-semibold text-red-200">{error}</p>
        <button type="button" onClick={() => void loadInventory(true)} className="inline-flex items-center gap-2 rounded-xl border border-red-200/30 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-950/40"><RefreshCw size={16} /> Try again</button>
      </section>
    );
  }

  return (
    <section className="grid gap-5" aria-label="Riftbound mock inventory">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Collected</p><p className="mt-2 text-xl font-black text-white">{pluralize(totalCards, 'card')}</p></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Total opened packs</p><p className="mt-2 text-xl font-black text-white">{totalOpenedPacks.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Unopened packs</p><p className="mt-2 text-xl font-black text-white">{totalPacks.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Unopened boxes</p><p className="mt-2 text-xl font-black text-white">{totalBoxes.toLocaleString()}</p></div>
      </div>

      {sealedProducts.length > 0 ? <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
        {sealedProducts.map((product) => <span key={product.set_code} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2"><strong className="text-white">{product.set_code}</strong> · {pluralize(product.pack_quantity, 'pack')} · {pluralize(product.box_quantity, 'box')}</span>)}
      </div> : null}

      <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)_auto]">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
              aria-label="Search mock Riftbound cards"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="search"
              className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-11 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300 focus:ring-2 focus:ring-violet-300/20 sm:text-sm"
            />
            {query ? <button type="button" aria-label="Clear mock card search" onClick={() => setQuery('')} className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-200"><X size={16} /></button> : null}
          </div>
          <AppSelectMenu label="Sort" value={sortMode} options={SORT_OPTIONS} onChange={setSortMode} className="min-w-0 [&>span]:sr-only" triggerClassName="h-14" />
          <button type="button" aria-label="Open mock card filters" aria-expanded={filtersOpen} title="Open mock card filters" onClick={() => setFiltersOpen((open) => !open)} className={`inline-flex h-14 w-14 items-center justify-center gap-1 rounded-2xl border text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-200 ${filtersOpen || activeFilterCount > 0 ? 'border-violet-200/50 bg-violet-300 text-slate-950' : 'border-white/10 bg-slate-900'}`}><SlidersHorizontal size={18} />{activeFilterCount > 0 ? <span className="-mr-2 -mt-6 rounded-md bg-slate-950 px-1.5 py-0.5 text-[0.65rem] text-violet-200">{activeFilterCount}</span> : null}</button>
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
            <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Minimum price</span><input type="number" min="0" step="0.01" inputMode="decimal" value={filters.minPrice} onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))} placeholder="No minimum" aria-label="Minimum price" className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300 focus:ring-2 focus:ring-violet-300/20 sm:text-sm" /></label>
            <label className="grid gap-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Maximum price</span><input type="number" min="0" step="0.01" inputMode="decimal" value={filters.maxPrice} onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))} placeholder="No maximum" aria-label="Maximum price" className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300 focus:ring-2 focus:ring-violet-300/20 sm:text-sm" /></label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">Showing {visibleItems.length} mock card {visibleItems.length === 1 ? 'entry' : 'entries'}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => void loadInventory(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-violet-200/30 bg-violet-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-violet-100 transition hover:border-violet-200/60 hover:bg-violet-300/20 disabled:cursor-wait disabled:opacity-60"><RefreshCw size={14} /> Refresh</button>
            <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/25 hover:text-white"><RotateCcw size={14} /> Reset filters</button>
          </div>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
          <Sparkles size={34} className="text-violet-200" />
          {items.length === 0 ? <div><h3 className="text-xl font-black text-white">No mock cards yet</h3><p className="mt-2 text-sm text-slate-400">Buy a mock product from <Link href="/riftbound/mock-opening" className="font-bold text-violet-200 hover:underline">Mock Opening</Link>, or use <code className="rounded bg-slate-900 px-1.5 py-0.5 text-violet-100">/riftbound buy</code> and <code className="rounded bg-slate-900 px-1.5 py-0.5 text-violet-100">/riftbound open</code> in Discord.</p></div> : <div><h3 className="text-xl font-black text-white">No mock cards match these filters</h3><p className="mt-2 text-sm text-slate-400">Adjust or reset the search and filters to view more of your collection.</p></div>}
        </div>
      ) : (
        <div className="riftbound-card-grid">
          {visibleItems.map((item) => (
            <article key={`${item.card_id}:${item.finish}:${item.treatment}`} className="riftbound-card-item overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
              <div className="relative aspect-[744/1039] overflow-hidden bg-slate-900">
                <RiftboundCardImage card={item.card} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 24vw, 180px" />
                <span className="absolute right-2 top-2 rounded-lg border border-white/20 bg-slate-950/85 px-2 py-1 text-xs font-black text-white">×{item.quantity.toLocaleString()}</span>
              </div>
              <div className="grid gap-1 p-3">
                <p className="truncate text-sm font-black text-white">{item.card.displayName}</p>
                <p className={`text-xs font-bold ${getRiftboundCardRarityTextClass(item.card)}`}>{item.card.rarity}</p>
                <div className="mt-1 flex flex-wrap gap-1 text-[0.65rem] font-black uppercase tracking-[0.08em]"><span className="rounded bg-slate-800 px-1.5 py-1 text-slate-200">{item.finish}</span>{item.treatment !== 'standard' ? <span className="rounded bg-violet-300/15 px-1.5 py-1 text-violet-200">{TREATMENT_LABELS[item.treatment]}</span> : null}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
