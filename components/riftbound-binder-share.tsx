'use client';

import { FileDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RiftboundBinderViewer } from '@/components/riftbound-binder-board';
import { createRiftboundBinderExport } from '@/lib/riftbound-binder-json';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import type { RiftboundShareBinder } from '@/lib/riftbound-share-types';

export function RiftboundBinderShareView({ binder, createdBy, createdAt }: { binder: RiftboundShareBinder; createdBy: string; createdAt: string }) {
  const [printMode, setPrintMode] = useState(false);
  const sharedBinder = {
    id: 'shared-riftbound-binder',
    name: binder.name,
    description: binder.description,
    created_at: createdAt,
    updated_at: createdAt,
    pages: binder.pages.map((page) => ({
      id: `shared-page-${page.pageNumber}`,
      page_number: page.pageNumber,
      name: page.name,
      slots: page.slots.map((slot) => ({ slot_index: slot.slotIndex, card_id: slot.cardId, finish: slot.finish })),
    })),
  };

  const printBinder = async () => {
    setPrintMode(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    window.print();
    setPrintMode(false);
  };

  const exportBinderJson = () => {
    const blob = new Blob([JSON.stringify(createRiftboundBinderExport(sharedBinder), null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${binder.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'riftbound-binder'}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen min-w-0 w-full overflow-x-clip bg-[#030712] px-4 py-8 text-slate-100 print:bg-white print:px-2 print:py-2 print:text-black"><div className="mx-auto grid w-full min-w-0 max-w-[1600px] gap-6 print:max-w-none print:gap-2"><header className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7 print:rounded-lg print:border-slate-300 print:bg-white print:p-3"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300 print:text-amber-700">Riftbound binder</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white print:text-lg print:text-black">{binder.name}</h1>{binder.description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 print:mt-1 print:text-[9px] print:text-slate-600">{binder.description}</p> : null}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500 print:mt-1 print:text-[8px] print:text-slate-600"><span>Shared by <Link href={`/riftbound/profile/${encodeURIComponent(createdBy)}`} className="font-black text-slate-300 transition hover:text-amber-200 hover:underline print:text-slate-700">{createdBy || 'Unknown user'}</Link></span></div></div><div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={exportBinderJson} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:bg-slate-800 hover:text-white"><FileDown size={14} /> Export Binder JSON</button><button type="button" onClick={() => void printBinder()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200"><FileDown size={14} /> Print / Save PDF</button></div></div></header><div className={printMode ? 'riftbound-binder-print-mode min-w-0' : 'min-w-0'}><RiftboundBinderViewer binder={sharedBinder} cards={RIFTBOUND_CARDS} printMode={printMode} /></div></div></main>;
}
