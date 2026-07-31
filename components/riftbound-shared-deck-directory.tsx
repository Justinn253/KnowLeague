'use client';

import Link from 'next/link';
import { ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundSharedDeckCard } from '@/components/riftbound-shared-deck-card';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getRiftboundSharedDecks } from '@/lib/riftbound-community-client';
import type { RiftboundSharedDeckSummary } from '@/lib/riftbound-community-types';

export function RiftboundSharedDeckDirectory() {
  const [session, setSession] = useState<Session | null>(null);
  const [decks, setDecks] = useState<RiftboundSharedDeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => subscribeToAuthSession((nextSession) => setSession(nextSession)), []);

  const loadDecks = useCallback(async (append = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const data = await getRiftboundSharedDecks(session, append ? cursorRef.current : null);
      if (requestId !== requestIdRef.current) return;
      setDecks((current) => append ? [...current, ...data.decks] : data.decks);
      cursorRef.current = data.nextCursor;
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load shared decks.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [session]);

  useEffect(() => {
    cursorRef.current = null;
    setNextCursor(null);
    void loadDecks(false);
  }, [loadDecks]);

  const updateDeck = (nextDeck: RiftboundSharedDeckSummary) => {
    setDecks((current) => current.map((deck) => deck.id === nextDeck.id ? nextDeck : deck));
  };

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10" aria-label="Shared Riftbound decks">
      <section className="mx-auto grid w-full max-w-[1600px] gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4 px-1">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound Community Decks</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Shared Riftbound Decks</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Browse deck snapshots shared by Riftbound players and open any deck to view its complete list.</p>
          </div>
          <Link href="/riftbound/community" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><ArrowLeft size={14} /> Community</Link>
        </header>

        {loading ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading shared decks...</section> : error ? <section className="grid gap-3 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error}</p><button type="button" onClick={() => void loadDecks(false)} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-red-200/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em]"><RefreshCw size={14} /> Try Again</button></section> : decks.length === 0 ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">No shared decks have been opened yet.</section> : <div className="grid gap-4">{decks.map((deck) => <RiftboundSharedDeckCard key={deck.id} deck={deck} session={session} onDeckChange={updateDeck} />)}</div>}

        {!loading && nextCursor ? <button type="button" onClick={() => void loadDecks(true)} disabled={loadingMore} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60">{loadingMore ? <LoaderCircle size={16} className="animate-spin" /> : null} Load More Shared Decks</button> : null}
      </section>
    </main>
  );
}
