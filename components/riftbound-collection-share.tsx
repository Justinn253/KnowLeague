'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, FileDown, PackageOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { RIFTBOUND_CARDS, type RiftboundCard, type RiftboundFinish } from '@/lib/riftbound';

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

const cardById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function formatMarketPrice(value: number | null) {
  return value === null ? 'N/A' : currencyFormatter.format(value);
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

function decodeRows(value: string): SharedInventoryRow[] {
  try {
    const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = window.atob(normalizedValue);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): SharedInventoryRow[] => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Partial<SharedInventoryRow>;
      const card = typeof candidate.card_id === 'string' ? cardById.get(candidate.card_id) : null;
      if (!card || (candidate.finish !== 'normal' && candidate.finish !== 'foil') || !card.finishOptions.includes(candidate.finish) || typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity <= 0 || candidate.quantity > 100000) return [];
      return [{ card_id: card.id, finish: candidate.finish, quantity: candidate.quantity }];
    });
  } catch {
    return [];
  }
}

export function RiftboundCollectionShare() {
  const [rows, setRows] = useState<SharedInventoryRow[]>([]);

  useEffect(() => {
    const data = new URLSearchParams(window.location.search).get('data');
    setRows(data ? decodeRows(data) : []);
  }, []);

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
        return card ? [{ card, ...quantitiesForCard }] : [];
      })
      .sort((left, right) => left.card.displayName.localeCompare(right.card.displayName));
  }, [rows]);

  const totalCopies = cards.reduce((total, entry) => total + entry.normal + entry.foil, 0);
  const totalValue = cards.reduce((total, entry) => total
    + ((entry.card.marketPrices.normal ?? 0) * entry.normal)
    + ((entry.card.marketPrices.foil ?? 0) * entry.foil), 0);

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10 print:bg-white print:px-2 print:py-2 print:text-black">
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 print:max-w-none print:gap-2">
        <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7 print:rounded-lg print:border-slate-300 print:bg-white print:p-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300 print:text-amber-700">Riftbound collection</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white print:text-lg print:text-black">Shared collection snapshot</h1>
              <p className="mt-2 text-sm text-slate-400 print:mt-1 print:text-[9px] print:text-slate-600">{cards.length} unique cards · {totalCopies} total cards · known value {formatMarketPrice(totalValue)}</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link href="/inventory" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white"><ArrowLeft size={14} /> Inventory</Link>
              <button type="button" onClick={() => void printCollection()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200"><FileDown size={14} /> Print / Save PDF</button>
            </div>
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-5 text-slate-500 print:hidden">Values are estimated from captured market prices provided by our pricing source and are not guaranteed sale prices. This read-only link is a snapshot of the collection at the time it was created.</p>
        </header>

        {cards.length === 0 ? (
          <section className="grid justify-items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center print:border-slate-300 print:bg-white">
            <PackageOpen size={38} className="text-amber-200 print:text-amber-700" />
            <p className="text-sm font-semibold text-slate-400 print:text-slate-600">This collection link is empty or no longer valid.</p>
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
            {cards.map(({ card, normal, foil }) => (
              <article key={card.id} className="flex min-w-0 break-inside-avoid flex-col rounded-2xl border border-white/10 bg-slate-950/80 p-4 print:rounded-lg print:border-slate-300 print:bg-white print:p-2">
                <h2 className="truncate text-center text-lg font-black text-white print:text-[10px] print:leading-tight print:text-black" title={card.displayName}>{card.displayName}</h2>
                <p className="mt-1 text-center text-xs font-bold uppercase tracking-[0.1em] text-slate-500 print:mt-0.5 print:text-[8px] print:text-slate-600">{card.setCode} · {card.numberLabel}</p>
                <div className="relative mx-auto mt-3 aspect-[744/1039] w-full max-w-[11rem] overflow-hidden rounded-xl bg-slate-900 print:mt-1 print:max-w-[4.5rem] print:rounded print:bg-slate-100">
                  <Image src={card.imageUrl} alt={`${card.displayName} card artwork`} fill sizes="176px" loading="eager" className="riftbound-print-card-image object-cover" />
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-400 print:mt-1 print:gap-0.5 print:text-[8px] print:text-slate-600">
                  {card.finishOptions.includes('normal') ? <p className="flex justify-between gap-2"><span>Normal · {normal}</span><span>{formatMarketPrice(card.marketPrices.normal)}</span></p> : null}
                  {card.finishOptions.includes('foil') ? <p className="flex justify-between gap-2 text-amber-200 print:text-amber-700"><span>Foil · {foil}</span><span>{formatMarketPrice(card.marketPrices.foil)}</span></p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
