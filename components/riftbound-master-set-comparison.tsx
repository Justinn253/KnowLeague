'use client';

import { CheckCircle2, ChevronDown, Circle, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getRiftboundCardRarityTextClass, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundMasterSetProgress, groupRiftboundCardsBySet, isRiftboundMasterSetCardAcquired } from '@/lib/riftbound-master-set';

type ComparisonCardGroup = {
  key: string;
  displayName: string;
  cards: RiftboundCard[];
};

function getComparisonVariantLabel(card: RiftboundCard) {
  return card.defaultFinish === 'foil' && card.finishOptions.length === 1 ? 'Foil' : 'Normal / Foil';
}

function groupComparisonCards(cards: readonly RiftboundCard[]) {
  return groupRiftboundCardsBySet(cards).map((set) => {
    const groups = new Map<string, ComparisonCardGroup>();
    set.cards.forEach((card) => {
      const baseCollectorNumber = card.collectorNumber.replace(/A$/i, '');
      const key = `${card.setCode}:${baseCollectorNumber}:${card.displayName.toLowerCase()}`;
      const current = groups.get(key);
      if (current) {
        current.cards.push(card);
        return;
      }
      groups.set(key, { key, displayName: card.displayName, cards: [card] });
    });

    return {
      setCode: set.setCode,
      setName: set.setName,
      cardGroups: Array.from(groups.values()).map((group) => ({
        ...group,
        cards: group.cards.slice().sort((left, right) => Number(getComparisonVariantLabel(left) === 'Foil') - Number(getComparisonVariantLabel(right) === 'Foil') || left.collectorNumber.localeCompare(right.collectorNumber, undefined, { numeric: true })),
      })),
    };
  });
}

function ComparisonStatus({ acquired, label }: { acquired: boolean; label: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="truncate text-[0.55rem] font-black uppercase tracking-[0.08em] text-slate-500" title={label}>{label}</span>
      <span className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[0.6rem] font-black uppercase tracking-[0.08em] ${acquired ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-950/70 text-slate-500'}`}>
        {acquired ? <CheckCircle2 size={12} /> : <Circle size={12} />}
        <span className="truncate">{acquired ? 'Acquired' : 'Missing'}</span>
      </span>
    </div>
  );
}

export function RiftboundMasterSetComparison({ cards, leftLabel, rightLabel, leftInventoryByCard, rightInventoryByCard, onClose }: {
  cards: readonly RiftboundCard[];
  leftLabel: string;
  rightLabel: string;
  leftInventoryByCard: ReadonlyMap<string, number>;
  rightInventoryByCard: ReadonlyMap<string, number>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [expandedSetCodes, setExpandedSetCodes] = useState<Set<string>>(() => new Set());
  const sets = useMemo(() => groupComparisonCards(cards), [cards]);
  const leftProgress = getRiftboundMasterSetProgress(cards, leftInventoryByCard);
  const rightProgress = getRiftboundMasterSetProgress(cards, rightInventoryByCard);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSets = useMemo(() => sets.map((set) => ({
    ...set,
    cardGroups: set.cardGroups.filter((group) => {
      if (!normalizedQuery) return true;
      return [set.setCode, set.setName, group.displayName, ...group.cards.flatMap((card) => [card.name, card.fullName, card.collectorNumber, card.numberLabel, card.rarity, getComparisonVariantLabel(card)])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    }),
  })).filter((set) => set.cardGroups.length > 0), [normalizedQuery, sets]);

  useEffect(() => {
    if (!normalizedQuery) return;
    setExpandedSetCodes((current) => {
      const next = new Set(current);
      filteredSets.forEach((set) => next.add(set.setCode));
      return next.size === current.size ? current : next;
    });
  }, [filteredSets, normalizedQuery]);

  const toggleSet = (setCode: string) => {
    setExpandedSetCodes((current) => {
      const next = new Set(current);
      if (next.has(setCode)) next.delete(setCode);
      else next.add(setCode);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-5" onPointerDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Compare Riftbound Master Sets" className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-4 sm:max-h-[calc(100dvh-2.5rem)] sm:p-6" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close Master Set comparison" className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={17} /></button>
        <div className="pr-12">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Master Set comparison</p>
          <h2 className="mt-2 text-2xl font-black text-white">Compare collection progress</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Both collections use the same set and card order. A card is acquired when at least one normal or foil copy exists.</p>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-slate-900/55 p-3 sm:grid-cols-2 sm:p-4">
          <div className="rounded-xl border border-amber-200/20 bg-amber-300/5 px-3 py-2">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-amber-200">{leftLabel}</p>
            <p className="mt-1 text-sm font-bold text-white">{leftProgress.acquired} / {leftProgress.total} cards <span className="text-emerald-300">{leftProgress.percent}%</span></p>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 px-3 py-2">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-emerald-200">{rightLabel}</p>
            <p className="mt-1 text-sm font-bold text-white">{rightProgress.acquired} / {rightProgress.total} cards <span className="text-emerald-300">{rightProgress.percent}%</span></p>
          </div>
        </div>

        <label className="relative mt-5 block">
          <span className="sr-only">Search Master Set comparison</span>
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search card name, number, rarity, or set..." aria-label="Search Master Set comparison" className="h-11 w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 pl-10 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" />
        </label>

        <div className="mt-5 max-h-[60vh] overflow-x-auto overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/25">
          <div className="min-w-[32rem] text-xs">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-x-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:gap-x-3">
              <div className="px-2 py-2 text-[0.6rem] font-black uppercase tracking-[0.14em] text-slate-500">Card</div>
              <div className="truncate px-2 py-2 text-center text-[0.6rem] font-black uppercase tracking-[0.12em] text-amber-200" title={leftLabel}>{leftLabel}</div>
              <div className="truncate px-2 py-2 text-center text-[0.6rem] font-black uppercase tracking-[0.12em] text-emerald-200" title={rightLabel}>{rightLabel}</div>
            </div>

            <div className="grid gap-2">
              {filteredSets.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-10 text-center text-sm font-semibold text-slate-500">No cards match this comparison search.</p> : filteredSets.map((set) => {
                const expanded = expandedSetCodes.has(set.setCode);
                const contentId = `riftbound-master-set-comparison-${set.setCode.toLowerCase()}`;
                return (
                  <section key={set.setCode} className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-900/55 transition-colors ${expanded ? '' : 'hover:border-amber-200/45 hover:bg-slate-900/80'}`}>
                    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => toggleSet(set.setCode)} className="flex w-full items-center justify-between gap-4 px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-amber-300">{set.setCode}</span>
                        <span className="truncate text-sm font-black text-white">{set.setName}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[0.6rem] font-black uppercase tracking-[0.1em] text-slate-500">
                        {set.cardGroups.length} cards
                        <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180 text-amber-200' : ''}`} />
                      </span>
                    </button>
                    {expanded ? <div id={contentId} className="grid border-t border-white/10 bg-slate-950/35">
                      {set.cardGroups.map((group) => (
                        <div key={group.key} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-start gap-x-2 border-b border-white/5 px-1 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:gap-x-3">
                          <div className="min-w-0 px-2">
                            <p className={`truncate text-xs font-black ${getRiftboundCardRarityTextClass(group.cards[0])}`} title={group.displayName}>{group.displayName}</p>
                            <div className="mt-1 grid gap-0.5">
                              {group.cards.map((card) => <p key={card.id} className="truncate text-[0.6rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.numberLabel} / {getComparisonVariantLabel(card)}</p>)}
                            </div>
                          </div>
                          <div className="grid gap-2 px-1">
                            {group.cards.map((card) => <ComparisonStatus key={card.id} label={getComparisonVariantLabel(card)} acquired={isRiftboundMasterSetCardAcquired(leftInventoryByCard, card.id)} />)}
                          </div>
                          <div className="grid gap-2 px-1">
                            {group.cards.map((card) => <ComparisonStatus key={card.id} label={getComparisonVariantLabel(card)} acquired={isRiftboundMasterSetCardAcquired(rightInventoryByCard, card.id)} />)}
                          </div>
                        </div>
                      ))}
                    </div> : null}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
