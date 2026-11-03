'use client';

import Link from 'next/link';
import { LoaderCircle, PackageOpen, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getRiftboundCardRarityTextClass, RIFTBOUND_CARDS } from '@/lib/riftbound';
import type { RiftboundMockInventoryItem, RiftboundMockSealedProduct, RiftboundMockTreatment } from '@/lib/riftbound-mock-inventory';

type MockInventoryResponse = {
  error?: string;
  items?: RiftboundMockInventoryItem[];
  sealedProducts?: RiftboundMockSealedProduct[];
};

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

export function RiftboundMockInventory({ session }: { session: Session | null }) {
  const [items, setItems] = useState<RiftboundMockInventoryItem[]>([]);
  const [sealedProducts, setSealedProducts] = useState<RiftboundMockSealedProduct[]>([]);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState('');

  const loadInventory = useCallback(async () => {
    if (!session) {
      setItems([]);
      setSealedProducts([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/riftbound/mock-inventory', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as MockInventoryResponse;
      if (!response.ok) throw new Error(payload.error || 'Unable to load your mock inventory.');
      setItems(payload.items ?? []);
      setSealedProducts(payload.sealedProducts ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load your mock inventory.');
      setItems([]);
      setSealedProducts([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const cardsById = useMemo(() => new Map(RIFTBOUND_CARDS.map((card) => [card.id, card])), []);
  const visibleItems = useMemo(() => items
    .flatMap((item) => {
      const card = cardsById.get(item.card_id);
      return card ? [{ ...item, card }] : [];
    })
    .sort((left, right) => (
      TREATMENT_ORDER[right.treatment] - TREATMENT_ORDER[left.treatment]
      || right.card.rarity.localeCompare(left.card.rarity)
      || left.card.displayName.localeCompare(right.card.displayName)
    )), [cardsById, items]);
  const totalCards = items.reduce((total, item) => total + item.quantity, 0);
  const totalPacks = sealedProducts.reduce((total, item) => total + item.pack_quantity, 0);
  const totalBoxes = sealedProducts.reduce((total, item) => total + item.box_quantity, 0);

  if (!session) {
    return (
      <section className="grid justify-items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
        <PackageOpen size={38} className="text-violet-200" />
        <div>
          <h2 className="text-2xl font-black text-white">Sign in to view your mock inventory</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Mock Riftbound packs opened through the KnowLeague Discord bot are saved separately from your real collection tracker.</p>
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
        <button type="button" onClick={() => void loadInventory()} className="inline-flex items-center gap-2 rounded-xl border border-red-200/30 px-4 py-2.5 text-sm font-black text-red-100 transition hover:bg-red-950/40"><RefreshCw size={16} /> Try again</button>
      </section>
    );
  }

  return (
    <section className="grid gap-5" aria-label="Riftbound mock inventory">
      <div className="grid gap-4 rounded-3xl border border-violet-300/20 bg-violet-300/5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">Discord mock collection</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Mock Riftbound Inventory</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Cards from the for-fun Discord unboxing system. These copies cannot be sold, edited, or mixed into your real Riftbound collection.</p>
        </div>
        <button type="button" onClick={() => void loadInventory()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200/30 bg-slate-950/70 px-4 py-2.5 text-sm font-black text-violet-100 transition hover:border-violet-200/60 hover:bg-slate-900"><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Collected</p><p className="mt-2 text-xl font-black text-white">{pluralize(totalCards, 'card')}</p></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Unopened packs</p><p className="mt-2 text-xl font-black text-white">{totalPacks.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Unopened boxes</p><p className="mt-2 text-xl font-black text-white">{totalBoxes.toLocaleString()}</p></div>
      </div>

      {sealedProducts.length > 0 ? <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300">
        {sealedProducts.map((product) => <span key={product.set_code} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2"><strong className="text-white">{product.set_code}</strong> · {pluralize(product.pack_quantity, 'pack')} · {pluralize(product.box_quantity, 'box')}</span>)}
      </div> : null}

      {visibleItems.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center">
          <Sparkles size={34} className="text-violet-200" />
          <div><h3 className="text-xl font-black text-white">No mock cards yet</h3><p className="mt-2 text-sm text-slate-400">Use <code className="rounded bg-slate-900 px-1.5 py-0.5 text-violet-100">/riftbound buy</code> and <code className="rounded bg-slate-900 px-1.5 py-0.5 text-violet-100">/riftbound open</code> in Discord to start unboxing.</p></div>
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
