'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle, Plus } from 'lucide-react';
import { AugmentCard } from '@/components/augment-card';
import {
  AugmentHeader,
  augmentButton,
  augmentRequest,
  cacheAugmentBinder,
  copyAugmentLink,
  getCachedAugmentBinder,
  useAugmentSession,
} from '@/components/augment-shared';
import { AUGMENT_TIERS } from '@/lib/augment-builder';
import type { AugmentBinderData } from '@/components/augment-shared';
import { getChatNameStyle } from '@/lib/chat-colors';

type Binder = AugmentBinderData;

export function AugmentBinder({ owner }: { owner: string }) {
  const { session, resolved } = useAugmentSession();
  const [pages, setPages] = useState<Record<string, Binder>>({});
  const [page, setPage] = useState(0);
  const [cacheRevision, setCacheRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const requested = useRef(new Set<string>());
  const pageKey = owner + ':' + page;
  const binder = pages[pageKey] ?? getCachedAugmentBinder(owner, page);

  useEffect(() => {
    if (!resolved) return;
    const requestedSet = requested.current;
    const cached = getCachedAugmentBinder(owner, page);
    if (cached) {
      setPages((current) => (current[pageKey] ? current : { ...current, [pageKey]: cached }));
      setLoading(false);
      return;
    }
    if (requestedSet.has(pageKey)) return;
    requestedSet.add(pageKey);
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void augmentRequest<Binder>('/api/augment-binders/' + owner + '?page=' + page, session, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        cacheAugmentBinder(owner, page, result);
        setPages((current) => ({ ...current, [pageKey]: result }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          requestedSet.delete(pageKey);
          setError(cause instanceof Error ? cause.message : 'Unable to load binder.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      requestedSet.delete(pageKey);
    };
  }, [cacheRevision, owner, page, pageKey, resolved, session]);

  useEffect(() => {
    function handleInvalidation(event: Event) {
      const invalidatedOwner = (event as CustomEvent<{ owner?: string }>).detail?.owner;
      if (invalidatedOwner !== owner) return;
      requested.current.clear();
      setPages({});
      setCacheRevision((value) => value + 1);
    }
    window.addEventListener('augment-binder-invalidated', handleInvalidation);
    return () => window.removeEventListener('augment-binder-invalidated', handleInvalidation);
  }, [owner]);

  return (
    <main className="mx-auto min-h-[calc(100vh-10rem)] max-w-7xl px-4 py-8 sm:px-6">
      <AugmentHeader title="Augment binder" back="/augment-builder" backLabel="To Community" />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        {binder ? (
          <h2 className="text-xl font-bold text-slate-100">
            <span style={getChatNameStyle(binder.author.chat_color)}>
              {binder.author.display_name || binder.author.username}
            </span>
            &apos;s augments
          </h2>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/augment-builder/create?fresh=1" className={augmentButton + ' !border-emerald-200/50 !bg-emerald-300 !text-slate-950 hover:!bg-emerald-200'}>
            <Plus size={16} />
            Create Augment
          </Link>
          <button
            className={augmentButton}
            aria-label="Copy binder link"
            title="Copy binder link"
            onClick={() => {
              void copyAugmentLink('/augment-builder/binder/' + owner)
                .then(() => {
                  setStatus('');
                  setLinkCopied(true);
                  window.setTimeout(() => setLinkCopied(false), 1600);
                })
                .catch(() => setStatus('Could not copy. Copy the address from your browser.'));
            }}
          >
            {linkCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>Copy binder link</span>
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mb-5 text-red-200">
          {error}
        </p>
      ) : null}
      <p role="status" className="mb-4 text-sm text-amber-100">
        {status}
      </p>
      {loading && !binder ? (
        <div role="status" className="flex items-center justify-center gap-3 py-16 text-slate-400">
          <LoaderCircle size={22} className="animate-spin text-amber-200" aria-hidden="true" />
          Loading binder...
        </div>
      ) : null}
      {!loading && binder?.augments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400">
          {page === 0 ? 'No augments yet. Finished augments will appear here.' : 'No more augments on this page.'}
        </div>
      ) : null}
      <div className="grid min-h-[34rem] grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 xl:grid-cols-4">
        {binder?.augments.map((augment) => (
          <Link
            key={augment.id}
            href={'/augment-builder/augment/' + augment.id}
            className="group flex min-w-0 select-none flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-3 transition hover:border-amber-200/60 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:p-4"
          >
            <AugmentCard draft={augment} />
            <div className="mt-auto pt-3 text-center">
              <h3 className="min-h-10 line-clamp-2 break-words font-bold text-white transition group-hover:text-amber-100">
                {augment.name}
              </h3>
              <p className="mt-2 min-h-5 text-xs text-slate-400">
                Tier {augment.averageTier === null ? 'Unrated' : AUGMENT_TIERS[Math.round(augment.averageTier)]} {'\u00b7'}{' '}

                {augment.upvotes} up / {augment.downvotes} down
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-4">
        <button className={augmentButton} disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {page + 1}</span>
        <button className={augmentButton} disabled={loading || !binder?.hasMore} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}

