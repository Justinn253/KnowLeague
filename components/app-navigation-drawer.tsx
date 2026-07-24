'use client';

import { ArrowRight, Menu, Package, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function AppNavigationDrawer() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-controls="app-navigation-drawer"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-14 min-w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-slate-900/80 px-4 text-slate-100 transition hover:-translate-y-0.5 hover:border-amber-200/50 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
      >
        <Menu size={19} />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/75 p-3 backdrop-blur-sm"
          onMouseDown={() => setIsOpen(false)}
        >
          <aside
            id="app-navigation-drawer"
            aria-label="App navigation"
            className="relative ml-auto flex h-full w-[min(22rem,calc(100vw-1.5rem))] animate-[slide-in_180ms_ease-out] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-white/10 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">KnowLeague</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Navigation</h2>
                </div>
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-slate-200 transition hover:border-white/20 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <nav aria-label="Primary navigation" className="flex-1 p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Riftbound</p>
              <Link
                href="/inventory"
                onClick={() => setIsOpen(false)}
                className="group mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-slate-100 transition hover:border-amber-200/40 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-300 text-slate-950">
                  <Package size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">Inventory</span>
                  <span className="mt-1 block text-xs text-slate-400">Track your Riftbound collection</span>
                </span>
                <ArrowRight size={17} className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-200" />
              </Link>
            </nav>

            <div className="border-t border-white/10 p-6">
              <p className="text-xs leading-5 text-slate-500">More destinations will be added here as KnowLeague grows.</p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
