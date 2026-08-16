'use client';

import { CheckCircle2, Circle, Search, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardRarityTextClass, RIFTBOUND_RARITY_ORDER, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundMasterSetProgress, groupRiftboundCardsBySet, isRiftboundMasterSetCardAcquired } from '@/lib/riftbound-master-set';

function MasterSetToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-10 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${checked ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-slate-950/60 text-slate-500 hover:border-white/25 hover:text-slate-300'}`}
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full border transition ${checked ? 'border-emerald-200 bg-emerald-300' : 'border-white/20 bg-slate-900'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition ${checked ? 'left-[1.05rem] bg-slate-950' : 'left-0.5 bg-slate-500'}`} />
      </span>
    </button>
  );
}

export function RiftboundMasterSet({ cards, inventoryByCard, onOpen, selectedCardId, createdBy, onShare, shareLabel = 'Share Master Set', shareDisabled = false, onCompare, compareLabel = 'Compare with my Master Set', heading = 'View your collection progress', description = 'Each card is marked acquired once you own at least one normal or foil copy.' }: {
  cards: readonly RiftboundCard[];
  inventoryByCard: ReadonlyMap<string, number>;
  onOpen: (card: RiftboundCard) => void;
  selectedCardId?: string;
  createdBy?: string;
  onShare?: () => void;
  shareLabel?: string;
  shareDisabled?: boolean;
  onCompare?: () => void;
  compareLabel?: string;
  heading?: string;
  description?: string;
}) {
  const [query, setQuery] = useState('');
  const [showOwnedCards, setShowOwnedCards] = useState(true);
  const [showSignatureCards, setShowSignatureCards] = useState(true);
  const [showOvernumberedCards, setShowOvernumberedCards] = useState(true);
  const [sortByRarity, setSortByRarity] = useState(false);
  const [expandedSetCodes, setExpandedSetCodes] = useState<Set<string>>(() => new Set());
  const sets = useMemo(() => groupRiftboundCardsBySet(cards), [cards]);
  const progress = useMemo(() => getRiftboundMasterSetProgress(cards, inventoryByCard), [cards, inventoryByCard]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSets = useMemo(() => sets.map((set) => ({
    ...set,
    cards: set.cards.filter((card) => {
      const acquired = isRiftboundMasterSetCardAcquired(inventoryByCard, card.id);
      if (!showOwnedCards && acquired) return false;
      if (!showSignatureCards && card.rarity === 'Signature') return false;
      if (!showOvernumberedCards && card.rarity === 'Overnumbered') return false;
      if (!normalizedQuery) return true;
      return [card.displayName, card.name, card.fullName, card.setCode, card.setName, card.numberLabel, card.collectorNumber, card.rarity]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    }).sort((left, right) => sortByRarity
      ? (RIFTBOUND_RARITY_ORDER.indexOf(left.rarity as typeof RIFTBOUND_RARITY_ORDER[number]) - RIFTBOUND_RARITY_ORDER.indexOf(right.rarity as typeof RIFTBOUND_RARITY_ORDER[number]))
        || left.numberLabel.localeCompare(right.numberLabel, undefined, { numeric: true })
        || left.id.localeCompare(right.id)
      : 0),
  })).filter((set) => set.cards.length > 0), [inventoryByCard, normalizedQuery, showOvernumberedCards, showOwnedCards, showSignatureCards, sets, sortByRarity]);
  const toggleSet = (setCode: string) => {
    setExpandedSetCodes((current) => {
      const next = new Set(current);
      if (next.has(setCode)) next.delete(setCode);
      else next.add(setCode);
      return next;
    });
  };

  return (
    <section className="grid gap-5 rounded-3xl border border-emerald-300/20 bg-slate-950/80 p-5 sm:p-6" aria-label="Riftbound master set">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Master Set</p>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{heading}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p> : null}
          {createdBy ? <p className="mt-2 text-xs font-semibold text-slate-500">Shared by <span className="font-black" style={getChatNameStyle()}>{createdBy}</span></p> : null}
          {onShare || onCompare ? <div className="mt-4 flex flex-wrap gap-2">
            {onShare ? <button type="button" onClick={onShare} disabled={shareDisabled} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-70"><Share2 size={14} /> {shareLabel}</button> : null}
            {onCompare ? <button type="button" onClick={onCompare} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200">{compareLabel}</button> : null}
          </div> : null}
        </div>
        <div className="grid min-w-52 gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-3 text-right">
          <p className="text-xl font-black text-white">{progress.acquired} <span className="text-sm text-slate-500">/ {progress.total} cards</span> <span className="ml-1 text-emerald-300">{progress.percent}%</span></p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-900" aria-hidden="true">
            <span className="block h-full rounded-full bg-emerald-300 transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/55 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <label className="relative block">
          <span className="sr-only">Search Master Set cards</span>
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search card name, number, or set..." aria-label="Search Master Set cards" className="h-11 w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 pl-10 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MasterSetToggle label="Show owned cards" checked={showOwnedCards} onChange={setShowOwnedCards} />
          <MasterSetToggle label="Show Signature cards" checked={showSignatureCards} onChange={setShowSignatureCards} />
          <MasterSetToggle label="Show Overnumbered cards" checked={showOvernumberedCards} onChange={setShowOvernumberedCards} />
          <MasterSetToggle label="Sort by rarity" checked={sortByRarity} onChange={setSortByRarity} />
        </div>
      </div>

      <div className="grid gap-5">
        {filteredSets.length === 0 ? <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-10 text-center text-sm font-semibold text-slate-500">No Master Set cards match these filters.</p> : filteredSets.map((set) => {
          const fullSet = sets.find((candidate) => candidate.setCode === set.setCode) ?? set;
          const setProgress = getRiftboundMasterSetProgress(fullSet.cards, inventoryByCard);
          const expanded = expandedSetCodes.has(set.setCode);
          const setContentId = `riftbound-master-set-${set.setCode.toLowerCase()}`;
          return (
            <section key={set.setCode} className={`grid gap-4 rounded-2xl border border-white/10 bg-slate-900/55 p-4 transition-colors sm:p-5 ${expanded ? '' : 'hover:border-amber-200/45 hover:bg-slate-900/80'}`} aria-label={`${set.setName} master set`}>
              <button type="button" aria-expanded={expanded} aria-controls={setContentId} onClick={() => toggleSet(set.setCode)} className="grid w-full gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">{set.setCode}</p>
                  <h3 className="mt-1 text-xl font-black text-white">{set.setName}</h3>
                </div>
                <div className="sm:min-w-56">
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-400">
                    <span>{setProgress.acquired} of {setProgress.total} acquired</span>
                    <span className="text-emerald-300">{setProgress.percent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950" aria-hidden="true">
                    <span className="block h-full rounded-full bg-emerald-300 transition-[width]" style={{ width: `${setProgress.percent}%` }} />
                  </div>
                </div>
              </button>

              <div id={setContentId} aria-hidden={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}>
                <div className="min-h-0 overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {set.cards.map((card) => {
                  const acquired = isRiftboundMasterSetCardAcquired(inventoryByCard, card.id);
                  const selected = selectedCardId === card.id;
                  return (
                    <article key={card.id} className={`min-w-0 rounded-2xl border p-2 transition-colors ${selected ? 'border-amber-300/90 bg-amber-300/5' : acquired ? 'border-emerald-300/45 bg-emerald-300/5' : 'border-white/10 bg-slate-950/70 hover:border-white/25'}`}>
                      <button type="button" tabIndex={expanded ? 0 : -1} onClick={() => onOpen(card)} aria-label={`${card.displayName}, ${acquired ? 'acquired' : 'missing'}`} className="block w-full text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">
                        <span className="relative block aspect-[744/1039] overflow-hidden rounded-xl bg-slate-900">
                          <RiftboundCardImage card={card} sizes="160px" className="object-cover" loading="lazy" preferHighResolution unoptimized />
                          <span className={`absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[0.55rem] font-black uppercase tracking-[0.08em] backdrop-blur-sm ${acquired ? 'border-emerald-200/40 bg-emerald-950/80 text-emerald-200' : 'border-white/15 bg-slate-950/85 text-slate-400'}`}>
                            {acquired ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                            {acquired ? 'Acquired' : 'Missing'}
                          </span>
                        </span>
                        <span className="mt-2 block min-w-0">
                          <span className={`block truncate text-sm font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</span>
                          <span className="mt-1 block truncate text-[0.6rem] font-black uppercase tracking-[0.1em] text-slate-500">{card.numberLabel}</span>
                        </span>
                      </button>
                    </article>
                  );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
