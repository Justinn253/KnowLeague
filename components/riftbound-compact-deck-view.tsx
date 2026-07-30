'use client';

import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getRiftboundCardDomainTextClass, type RiftboundCard } from '@/lib/riftbound';

export type RiftboundCompactDeckEntry = {
  card: RiftboundCard;
  quantity: number;
};

type RiftboundCompactSectionProps = {
  label: string;
  entries: RiftboundCompactDeckEntry[];
  onOpen: (card: RiftboundCard) => void;
  tone: 'green' | 'blue' | 'amber' | 'violet' | 'cyan' | 'rose' | 'red';
  highlighted?: boolean;
  className?: string;
};

function formatCompactDeckDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const sectionToneClasses: Record<RiftboundCompactSectionProps['tone'], string> = {
  green: 'border-emerald-300/35 bg-emerald-300/[0.04]',
  blue: 'border-blue-300/35 bg-blue-300/[0.04]',
  amber: 'border-amber-300/40 bg-amber-300/[0.05]',
  violet: 'border-violet-300/35 bg-violet-300/[0.04]',
  cyan: 'border-cyan-300/35 bg-cyan-300/[0.04]',
  rose: 'border-rose-300/35 bg-rose-300/[0.04]',
  red: 'border-red-300/35 bg-red-300/[0.04]',
};

function RiftboundCompactCardTile({ card, quantity, onOpen, highlighted = false }: { card: RiftboundCard; quantity: number; onOpen: (card: RiftboundCard) => void; highlighted?: boolean }) {
  const isBattlefield = card.cardType === 'Battlefield' || card.cardTypeLabels.includes('Battlefield');

  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className={`group relative flex min-w-0 flex-col items-center rounded-xl border p-1 text-center transition hover:border-amber-200/60 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 ${highlighted ? 'w-full max-w-full border-amber-200/80 bg-amber-300/10' : isBattlefield ? 'w-[8rem] max-w-full border-white/10 bg-slate-950/70' : 'w-[5.5rem] max-w-full border-white/10 bg-slate-950/70'}`}
    >
      <span className={`relative block w-full overflow-hidden rounded-md bg-slate-900 ${isBattlefield ? 'aspect-[1038/744]' : 'aspect-[744/1039]'}`}>
        <RiftboundCardImage card={card} orientation={isBattlefield ? 'landscape' : 'portrait'} sizes={highlighted ? '360px' : '220px'} loading={highlighted ? 'eager' : 'lazy'} quality={highlighted ? 100 : 90} className="object-cover" />
        <span className="absolute bottom-1 right-1 rounded-md border border-amber-200/40 bg-slate-950/95 px-1.5 py-0.5 text-[0.6rem] font-black text-amber-200">×{quantity}</span>
      </span>
      <span className={`mt-1 w-full truncate text-[0.65rem] font-black ${getRiftboundCardDomainTextClass(card)}`} title={card.displayName}>{card.displayName}</span>
      <span className="mt-0.5 w-full truncate text-[0.55rem] font-black uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}</span>
    </button>
  );
}

function RiftboundCompactSection({ label, entries, onOpen, tone, highlighted = false, className = '' }: RiftboundCompactSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section className={`h-fit grid content-start gap-1.5 rounded-2xl border p-2.5 ${sectionToneClasses[tone]} ${className}`}>
      <h2 className="text-[0.6rem] font-black uppercase tracking-[0.2em] text-amber-300">{label}</h2>
      <div className="flex flex-wrap items-start gap-1.5">
        {entries.map(({ card, quantity }) => <RiftboundCompactCardTile key={card.id} card={card} quantity={quantity} onOpen={onOpen} highlighted={highlighted} />)}
      </div>
    </section>
  );
}

export function RiftboundCompactDeckView({ shareUrl, creatorName, deckName, createdAt, legendEntries, championEntries, mainEntries, runeEntries, battlefieldEntries, sideboardEntries, onOpen, mainLabel = 'Main Deck', showHeader = true, className = '' }: { shareUrl: string; creatorName: string; deckName: string; createdAt: string; legendEntries: RiftboundCompactDeckEntry[]; championEntries: RiftboundCompactDeckEntry[]; mainEntries: RiftboundCompactDeckEntry[]; runeEntries: RiftboundCompactDeckEntry[]; battlefieldEntries: RiftboundCompactDeckEntry[]; sideboardEntries: RiftboundCompactDeckEntry[]; onOpen: (card: RiftboundCard) => void; mainLabel?: string; showHeader?: boolean; className?: string }) {
  return (
    <section className={`grid gap-3 rounded-3xl border border-amber-200/20 bg-slate-950/90 p-3 sm:p-4 ${className}`}>
      {showHeader ? <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">KnowLeague Deck Share</p>
        <p className="max-w-full truncate text-sm font-black text-white" title={deckName}>{deckName}</p>
        <p className="max-w-full truncate text-xs font-semibold text-slate-400" title={creatorName}>by {creatorName}</p>
        <p className="text-xs text-slate-500">{formatCompactDeckDate(createdAt)}</p>
      </div> : null}
      <div className="grid gap-3 lg:grid-cols-[13.2rem_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <RiftboundCompactSection label="Legend" entries={legendEntries} onOpen={onOpen} tone="amber" highlighted />
        </div>
        <div className="grid items-start gap-3">
          <div className="flex flex-wrap items-start gap-3 lg:flex-nowrap">
            <RiftboundCompactSection label="Champion Units" entries={championEntries} onOpen={onOpen} tone="rose" className="w-fit max-w-full" />
            <RiftboundCompactSection label="Runes" entries={runeEntries} onOpen={onOpen} tone="green" className="w-fit max-w-full" />
            <RiftboundCompactSection label="Battlefields" entries={battlefieldEntries} onOpen={onOpen} tone="cyan" className="w-fit max-w-full" />
            <div className="ml-auto grid h-[12.25rem] w-[12.25rem] max-w-full flex-none place-items-center p-0">
              {shareUrl ? <img src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&ecc=L&data=${encodeURIComponent(shareUrl)}`} alt="QR code for this Riftbound deck share link" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full rounded-lg" /> : <span className="text-center text-xs text-slate-500">Preparing QR code...</span>}
            </div>
          </div>
          <RiftboundCompactSection label={mainLabel} entries={mainEntries} onOpen={onOpen} tone="red" />
          <RiftboundCompactSection label="Sideboard" entries={sideboardEntries} onOpen={onOpen} tone="violet" className="w-fit max-w-full" />
        </div>
      </div>
    </section>
  );
}
