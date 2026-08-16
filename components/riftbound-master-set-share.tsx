'use client';

import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundMasterSet } from '@/components/riftbound-master-set';
import { RiftboundMasterSetComparison } from '@/components/riftbound-master-set-comparison';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundBootstrap } from '@/lib/riftbound-client';
import { RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { buildRiftboundMasterSetInventoryMap, isRiftboundMasterSetCatalogueCard } from '@/lib/riftbound-master-set';
import type { RiftboundShareSnapshot } from '@/lib/riftbound-share-types';

export function RiftboundMasterSetShare({ snapshot, session, authResolved }: { snapshot: RiftboundShareSnapshot; session: Session | null; authResolved: boolean }) {
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [comparisonInventory, setComparisonInventory] = useState<ReadonlyMap<string, number> | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const cards = useMemo(() => RIFTBOUND_CARDS.filter(isRiftboundMasterSetCatalogueCard), []);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const sharedInventory = useMemo(() => buildRiftboundMasterSetInventoryMap(snapshot.rows), [snapshot.rows]);
  const sharedCreatorName = snapshot.createdBy || 'Shared user';

  const compareWithMyMasterSet = async () => {
    if (!session) return;
    if (comparisonInventory) {
      setComparisonOpen(true);
      return;
    }
    setComparisonLoading(true);
    setComparisonError('');
    try {
      const response = await getRiftboundBootstrap(session);
      setComparisonInventory(buildRiftboundMasterSetInventoryMap(response.inventory?.items ?? []));
      setComparisonOpen(true);
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : 'Unable to load your Master Set for comparison.');
    } finally {
      setComparisonLoading(false);
    }
  };

  return (
    <main className="min-h-screen min-w-0 w-full overflow-x-clip bg-[#030712] px-4 py-8 text-slate-100 print:bg-white print:px-2 print:py-2 print:text-black sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-6 print:max-w-none print:gap-2">
        <header className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7 print:rounded-lg print:border-slate-300 print:bg-white print:p-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300 print:text-emerald-700">Shared Riftbound Master Set</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white print:text-lg print:text-black">{snapshot.title || 'Master Set'}</h1>
              <p className="mt-2 text-sm text-slate-400 print:mt-1 print:text-[9px] print:text-slate-600">Shared by <Link href={`/riftbound/profile/${encodeURIComponent(sharedCreatorName)}`} className="font-black hover:underline" style={getChatNameStyle()}>{sharedCreatorName}</Link></p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {authResolved && !session ? <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white">Log in to compare</Link> : null}
            </div>
          </div>
          {comparisonError ? <p role="alert" className="mt-3 text-sm font-semibold text-red-200 print:hidden">{comparisonError}</p> : null}
        </header>

        <RiftboundMasterSet
          cards={cards}
          inventoryByCard={sharedInventory}
          selectedCardId={selectedCard?.id}
          onOpen={setSelectedCard}
          heading={`View ${sharedCreatorName}'s collection progress`}
          description=""
          onCompare={authResolved && session ? () => void compareWithMyMasterSet() : undefined}
          compareLabel={comparisonLoading ? 'Loading my Master Set...' : 'Compare with my Master Set'}
        />

        {selectedCard ? <RiftboundCardDetailsModal card={cardsById.get(selectedCard.id) ?? selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={false} showInventoryControls={false} showMarketDetails preferenceSession={session} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
        {comparisonOpen && comparisonInventory ? <RiftboundMasterSetComparison cards={cards} leftLabel={sharedCreatorName} rightLabel="You" leftInventoryByCard={sharedInventory} rightInventoryByCard={comparisonInventory} onClose={() => setComparisonOpen(false)} /> : null}
        {comparisonLoading ? <LoaderCircle size={18} className="sr-only animate-spin" aria-label="Loading comparison" /> : null}
      </div>
    </main>
  );
}
