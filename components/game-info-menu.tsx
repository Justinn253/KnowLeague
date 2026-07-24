'use client';

import { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

export function GameInfoMenu({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`How to play ${title}`}
        aria-expanded={open}
        title="How to play"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/90 text-slate-200 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        <Info size={18} />
      </button>
      {open ? (
        <div className="absolute right-0 top-14 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-slate-950 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">How to Play</p>
              <h2 className="mt-2 text-lg font-semibold text-white">{title}</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close how to play" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-300">
              <X size={18} />
            </button>
          </div>
          <ol className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
            {steps.map((step, index) => <li key={step}><span className="mr-2 font-semibold text-amber-300">{index + 1}.</span>{step}</li>)}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
