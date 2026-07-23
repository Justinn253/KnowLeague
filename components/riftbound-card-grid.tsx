'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Minus, PackageOpen, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  item?: InventoryItem | null;
  error?: string;
};

type InventoryFilters = {
  setCode: string;
  rarity: string;
  cardType: string;
  domain: string;
  energyCost: string;
  powerCost: string;
  might: string;
};

const ALL_FILTER_VALUE = 'all';
const emptyFilters: InventoryFilters = {
  setCode: ALL_FILTER_VALUE,
  rarity: ALL_FILTER_VALUE,
  cardType: ALL_FILTER_VALUE,
  domain: ALL_FILTER_VALUE,
  energyCost: ALL_FILTER_VALUE,
  powerCost: ALL_FILTER_VALUE,
  might: ALL_FILTER_VALUE,
};

const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Token'];

const rarityStyles: Record<string, string> = {
  Common: 'text-slate-300',
  Uncommon: 'text-emerald-200',
  Rare: 'text-blue-200',
  Epic: 'text-violet-200',
  Showcase: 'text-amber-200',
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function filterOptions(values: string[], allLabel: string): AppSelectOption<string>[] {
  return [
    { value: ALL_FILTER_VALUE, label: allLabel },
    ...values.map((value) => ({ value, label: value })),
  ];
}

function getInventoryKey(cardId: string, finish: InventoryItem['finish']) {
  return `${cardId}:${finish}`;
}

function getCardQuantity(inventoryByCard: Map<string, number>, cardId: string) {
  return inventoryByCard.get(cardId) ?? 0;
}

function updateInventoryRows(rows: InventoryItem[], card: RiftboundCard, delta: 1 | -1) {
  const finish = card.defaultFinish;
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

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-xs font-bold text-slate-200" title={value}>{value}</dd>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1.5 text-center">
      <p className="text-[0.56rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function RiftboundCardRow({
  card,
  quantity,
  pending,
  onOpen,
  onAdjust,
}: {
  card: RiftboundCard;
  quantity: number;
  pending: boolean;
  onOpen: (card: RiftboundCard) => void;
  onAdjust: (card: RiftboundCard, delta: 1 | -1) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-slate-950/80 p-3 transition-colors hover:border-white/20 hover:bg-slate-950 sm:p-4">
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
            className="object-cover"
            loading="lazy"
          />
        </span>
        <span className="order-1 min-w-0 w-full">
          <span className="block truncate text-lg font-black tracking-tight text-white" title={card.displayName}>{card.displayName}</span>
          <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
        </span>
      </button>

      <div className="mt-3 flex shrink-0 items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-900/80 p-1">
        <button
          type="button"
          aria-label={`Remove one ${card.displayName}`}
          disabled={quantity === 0 || pending}
          onClick={() => onAdjust(card, -1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-8 text-center text-sm font-black text-amber-200" aria-label={`${quantity} owned`}>{quantity}</span>
        <button
          type="button"
          aria-label={`Add one ${card.displayName}`}
          disabled={pending}
          onClick={() => onAdjust(card, 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>
    </article>
  );
}

function RiftboundCardDetailsModal({
  card,
  quantity,
  pending,
  onClose,
  onAdjust,
}: {
  card: RiftboundCard;
  quantity: number;
  pending: boolean;
  onClose: () => void;
  onAdjust: (card: RiftboundCard, delta: 1 | -1) => void;
}) {
  const rarityClassName = rarityStyles[card.rarity] ?? 'text-slate-300';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${card.displayName} details`}
        className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50"
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

        <div className="grid gap-6 p-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-7">
          <div className="relative mx-auto aspect-[744/1039] w-40 overflow-hidden rounded-2xl bg-slate-900 sm:mx-0 sm:w-40">
            <Image src={card.imageUrl} alt={`${card.displayName} card artwork`} fill sizes="160px" className="object-cover" />
          </div>

          <div className="grid min-w-0 gap-5">
            <div className="flex items-start justify-between gap-4 pr-12">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{card.setName} · {card.setCode} {card.numberLabel}</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{card.displayName}</h2>
                <p className={`mt-2 text-sm font-black ${rarityClassName}`}>{card.rarity} · {card.defaultFinish === 'foil' ? 'Foil default' : 'Normal default'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-slate-900/80 p-1">
                <button type="button" aria-label={`Remove one ${card.displayName}`} disabled={quantity === 0 || pending} onClick={() => onAdjust(card, -1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Minus size={14} /></button>
                <span className="min-w-8 text-center text-sm font-black text-amber-200">{quantity}</span>
                <button type="button" aria-label={`Add one ${card.displayName}`} disabled={pending} onClick={() => onAdjust(card, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Current market value</p>
                <p className="mt-1 text-2xl font-black text-emerald-300">{formatMarketPrice(card.marketPrice)}</p>
              </div>
              <p className="text-right text-xs text-slate-500">Per card · {card.marketPriceUpdatedAt ? 'Latest snapshot' : 'No price available'}</p>
            </div>

            <dl className="grid grid-cols-3 gap-2">
              <CompactStat label="Energy" value={card.energyCost} />
              <CompactStat label="Power" value={card.powerCost} />
              <CompactStat label="Might" value={card.might} />
            </dl>

            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <DetailValue label="Card Type" value={card.cardTypeLabels.join('; ')} />
              <DetailValue label="Tag" value={card.tags.join('; ') || '—'} />
              <DetailValue label="Domain" value={card.domains.join('; ') || 'Colorless'} />
              <DetailValue label="Number" value={`${card.setCode} ${card.numberLabel}`} />
              <DetailValue label="Finish Options" value={card.finishOptions.join('; ')} />
              <DetailValue label="Artist" value={card.artist || '—'} />
            </dl>

            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Product Details</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{card.productDetails}</p>
            </div>

            <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">
              View source card
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RiftboundCardGrid() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('global');
  const [query, setQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<InventoryFilters>(emptyFilters);
  const [inventoryRows, setInventoryRows] = useState<InventoryItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(() => new Set());
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);

  const loadInventory = useCallback(async (nextSession: Session) => {
    setInventoryLoading(true);
    setInventoryError('');

    try {
      const response = await fetch('/api/riftbound/inventory', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json() as InventoryResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load your Riftbound inventory.');
      }
      setInventoryRows(data.items ?? []);
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : 'Unable to load your Riftbound inventory.');
      setInventoryRows([]);
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
      setInventoryLoading(false);
      setInventoryError('');
    }
  }), [loadInventory]);

  const inventoryByCard = useMemo(() => {
    const quantities = new Map<string, number>();
    inventoryRows.forEach((row) => quantities.set(row.card_id, (quantities.get(row.card_id) ?? 0) + row.quantity));
    return quantities;
  }, [inventoryRows]);

  const filterOptionsByField = useMemo(() => ({
    setCode: filterOptions(uniqueSorted(RIFTBOUND_CARDS.map((card) => card.setCode)), 'All sets'),
    rarity: filterOptions(rarityOrder.filter((rarity) => RIFTBOUND_CARDS.some((card) => card.rarity === rarity)), 'All rarities'),
    cardType: filterOptions(uniqueSorted(RIFTBOUND_CARDS.map((card) => card.cardType)), 'All card types'),
    domain: filterOptions(uniqueSorted(RIFTBOUND_CARDS.flatMap((card) => card.domains)), 'All domains'),
    energyCost: filterOptions(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.energyCost))), 'All energy costs'),
    powerCost: filterOptions(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.powerCost))), 'All power costs'),
    might: filterOptions(uniqueSorted(RIFTBOUND_CARDS.map((card) => String(card.might))), 'All might values'),
  }), []);

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedTagQuery = tagQuery.trim().toLowerCase();

    return RIFTBOUND_CARDS.filter((card) => {
      const quantity = getCardQuantity(inventoryByCard, card.id);
      if (activeTab === 'inventory' && quantity === 0) return false;
      if (filters.setCode !== ALL_FILTER_VALUE && card.setCode !== filters.setCode) return false;
      if (filters.rarity !== ALL_FILTER_VALUE && card.rarity !== filters.rarity) return false;
      if (filters.cardType !== ALL_FILTER_VALUE && card.cardType !== filters.cardType) return false;
      if (filters.domain !== ALL_FILTER_VALUE && !card.domains.includes(filters.domain)) return false;
      if (filters.energyCost !== ALL_FILTER_VALUE && String(card.energyCost) !== filters.energyCost) return false;
      if (filters.powerCost !== ALL_FILTER_VALUE && String(card.powerCost) !== filters.powerCost) return false;
      if (filters.might !== ALL_FILTER_VALUE && String(card.might) !== filters.might) return false;
      if (normalizedTagQuery && !card.tags.some((tag) => tag.toLowerCase().includes(normalizedTagQuery))) return false;

      if (!normalizedQuery) return true;
      const searchableText = [
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
      ].join(' ').toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [activeTab, filters, inventoryByCard, query, tagQuery]);

  const ownedUniqueCount = inventoryByCard.size;
  const ownedCopyCount = Array.from(inventoryByCard.values()).reduce((total, quantity) => total + quantity, 0);
  const unpricedCopyCount = inventoryRows.reduce((total, row) => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === row.card_id);
    return total + (card?.marketPrice === null ? row.quantity : 0);
  }, 0);
  const totalMarketValue = inventoryRows.reduce((total, row) => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === row.card_id);
    return total + (card?.marketPrice ?? 0) * row.quantity;
  }, 0);
  const activeFilterCount = Object.values(filters).filter((value) => value !== ALL_FILTER_VALUE).length + (tagQuery.trim() ? 1 : 0);

  const adjustInventory = async (card: RiftboundCard, delta: 1 | -1) => {
    if (!session) {
      setInventoryError('Sign in to track your Riftbound inventory.');
      setActiveTab('inventory');
      return;
    }

    const currentQuantity = getCardQuantity(inventoryByCard, card.id);
    if (delta === -1 && currentQuantity === 0) return;

    const previousRows = inventoryRows;
    setInventoryRows((rows) => updateInventoryRows(rows, card, delta));
    setPendingCardIds((ids) => new Set(ids).add(card.id));
    setInventoryError('');

    try {
      const response = await fetch('/api/riftbound/inventory', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardId: card.id, finish: card.defaultFinish, delta }),
      });
      const data = await response.json() as InventoryMutationResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Unable to update your Riftbound inventory.');
      }

      if (data.item) {
        setInventoryRows((rows) => [
          ...rows.filter((row) => getInventoryKey(row.card_id, row.finish) !== getInventoryKey(data.item!.card_id, data.item!.finish)),
          data.item!,
        ]);
      }
    } catch (error) {
      setInventoryRows(previousRows);
      setInventoryError(error instanceof Error ? error.message : 'Unable to update your Riftbound inventory.');
    } finally {
      setPendingCardIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(card.id);
        return nextIds;
      });
    }
  };

  const resetFilters = () => {
    setQuery('');
    setTagQuery('');
    setFilters(emptyFilters);
  };

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10" aria-label="Riftbound card catalogue">
      <section className="mx-auto grid w-full max-w-[160rem] gap-6">
        <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          {activeTab === 'inventory' ? (
            <div className="grid gap-2 text-left sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Owned</p>
                <p className="mt-1 text-lg font-black text-amber-200">{ownedCopyCount} copies</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Known value</p>
                <p className="mt-1 text-lg font-black text-emerald-300">{formatMarketPrice(totalMarketValue)}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-900/70 p-1">
            {(['global', 'inventory'] as InventoryTab[]).map((tab) => {
              const active = activeTab === tab;
              const label = tab === 'global' ? 'Global' : 'Inventory';
              const count = tab === 'global' ? RIFTBOUND_CARDS.length : ownedUniqueCount;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${active ? 'border-amber-200/50 bg-amber-300 text-slate-950 shadow-lg shadow-amber-950/20' : 'border-transparent text-slate-400 hover:border-white/15 hover:bg-slate-800/80 hover:text-white'}`}
                >
                  {label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[0.65rem] ${active ? 'bg-slate-950/15' : 'bg-slate-950 text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
                  aria-label="Search Riftbound cards"
                  className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                />
              </div>

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
            {filtersOpen ? (
              <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:grid-cols-2 xl:grid-cols-4">
                <AppSelectMenu label="Set" value={filters.setCode} options={filterOptionsByField.setCode} onChange={(value) => setFilters((current) => ({ ...current, setCode: value }))} />
                <AppSelectMenu label="Rarity" value={filters.rarity} options={filterOptionsByField.rarity} onChange={(value) => setFilters((current) => ({ ...current, rarity: value }))} />
                <AppSelectMenu label="Card Type" value={filters.cardType} options={filterOptionsByField.cardType} onChange={(value) => setFilters((current) => ({ ...current, cardType: value }))} />
                <AppSelectMenu label="Domain" value={filters.domain} options={filterOptionsByField.domain} onChange={(value) => setFilters((current) => ({ ...current, domain: value }))} />
                <AppSelectMenu label="Energy Cost" value={filters.energyCost} options={filterOptionsByField.energyCost} onChange={(value) => setFilters((current) => ({ ...current, energyCost: value }))} />
                <AppSelectMenu label="Power Cost" value={filters.powerCost} options={filterOptionsByField.powerCost} onChange={(value) => setFilters((current) => ({ ...current, powerCost: value }))} />
                <AppSelectMenu label="Might" value={filters.might} options={filterOptionsByField.might} onChange={(value) => setFilters((current) => ({ ...current, might: value }))} />
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
            ) : null}

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filteredCards.map((card) => (
              <RiftboundCardRow
                key={card.id}
                card={card}
                quantity={getCardQuantity(inventoryByCard, card.id)}
                pending={pendingCardIds.has(card.id)}
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
          quantity={getCardQuantity(inventoryByCard, selectedCard.id)}
          pending={pendingCardIds.has(selectedCard.id)}
          onClose={() => setSelectedCard(null)}
          onAdjust={adjustInventory}
        />
      ) : null}
    </main>
  );
}
