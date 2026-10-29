'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { AugmentCard } from '@/components/augment-card';
import {
  AugmentAuthHint,
  AugmentExport,
  AugmentHeader,
  augmentButton,
  augmentRequest,
  cacheAugmentView,
  getCachedAugmentView,
  useAugmentSession,
} from '@/components/augment-shared';
import { AUGMENT_TIERS, type PublishedAugment } from '@/lib/augment-builder';
import { getChatNameStyle } from '@/lib/chat-colors';

export function AugmentView({ id, forceCommunityBack = false }: { id: string; forceCommunityBack?: boolean }) {
  const { session, resolved } = useAugmentSession();
  const [augment, setAugment] = useState<PublishedAugment | null>(null);
  const [error, setError] = useState('');
  const augmentRef = useRef<PublishedAugment | null>(null);
  const voteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const applyAugment = useCallback(
    (next: PublishedAugment) => {
      augmentRef.current = next;
      setAugment(next);
      cacheAugmentView(next, session?.user.id ?? null);
    },
    [session?.user.id],
  );
  useEffect(() => {
    if (!resolved) return;
    const viewer = session?.user.id ?? null;
    const cached = getCachedAugmentView(id, viewer);
    setError('');
    if (cached) {
      applyAugment(cached);
      return;
    }
    const controller = new AbortController();
    augmentRef.current = null;
    setAugment(null);
    void augmentRequest<{ augment: PublishedAugment }>(`/api/augments/${id}`, session, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) applyAugment(result.augment);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load augment.');
      });
    return () => controller.abort();
  }, [applyAugment, id, session, resolved]);
  function vote(kind: 'reaction' | 'tier', value: number | null) {
    if (!session || !augmentRef.current) return;
    const previous = augmentRef.current;
    const currentValue = kind === 'reaction' ? previous.viewerReaction : previous.viewerTier;
    const nextValue = kind === 'reaction' && currentValue === value ? null : value;
    const nextAugment: PublishedAugment = kind === 'reaction'
      ? {
          ...previous,
          viewerReaction: nextValue,
          upvotes: Math.max(0, previous.upvotes - (previous.viewerReaction === 1 ? 1 : 0) + (nextValue === 1 ? 1 : 0)),
          downvotes: Math.max(0, previous.downvotes - (previous.viewerReaction === -1 ? 1 : 0) + (nextValue === -1 ? 1 : 0)),
        }
      : { ...previous, viewerTier: nextValue };
    applyAugment(nextAugment);
    const request = voteQueueRef.current
      .catch(() => undefined)
      .then(() => augmentRequest<{ augment: PublishedAugment }>(`/api/augments/${previous.id}`, session, {
        method: 'POST',
        body: JSON.stringify({ kind, value: nextValue }),
      }));
    voteQueueRef.current = request;
    void request
      .then((result) => {
        const latest = augmentRef.current;
        const unchanged = latest && (kind === 'reaction' ? latest.viewerReaction === nextValue : latest.viewerTier === nextValue);
        if (unchanged) {
          const current = augmentRef.current;
          if (!current) return;
          applyAugment(
            kind === 'reaction'
              ? { ...result.augment, viewerTier: current.viewerTier }
              : {
                  ...result.augment,
                  viewerReaction: current.viewerReaction,
                  upvotes: current.upvotes,
                  downvotes: current.downvotes,
                },
          );
        }
      })
      .catch((cause) => {
        const latest = augmentRef.current;
        const unchanged = latest && (kind === 'reaction' ? latest.viewerReaction === nextValue : latest.viewerTier === nextValue);
        if (unchanged) {
          const current = augmentRef.current;
          if (!current) return;
          applyAugment(
            kind === 'reaction'
              ? { ...previous, viewerTier: current.viewerTier }
              : {
                  ...previous,
                  viewerReaction: current.viewerReaction,
                  upvotes: current.upvotes,
                  downvotes: current.downvotes,
                },
          );
        }
        setError(cause instanceof Error ? cause.message : 'Unable to save vote.');
      });
  }
  return (
    <main className="mx-auto min-h-[calc(100vh-10rem)] max-w-5xl px-4 py-8 sm:px-6">
      <AugmentHeader
        title="Community augment"
        back="/augment-builder"
        backLabel="To Community"
        binder={session?.user.id}
        forceBack={forceCommunityBack}
      />
      {error ? (
        <p role="alert" className="mb-6 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-red-200">
          {error}
        </p>
      ) : null}
      {!augment && !error ? (
        <div role="status" className="grid min-h-[42rem] gap-6 md:grid-cols-[360px_minmax(0,1fr)] md:gap-8">
          <div className="min-h-[34rem] animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
          <div className="min-h-[34rem] animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
          <span className="sr-only">Loading augment...</span>
        </div>
      ) : null}      {augment ? (
        <div className="grid gap-6 md:grid-cols-[360px_minmax(0,1fr)] md:gap-8">
          <div className="min-w-0 select-none space-y-3">
          <AugmentCard draft={augment} />
              <div className="mt-3 flex justify-center gap-3 sm:justify-end"><AugmentAuthHint authenticated={Boolean(session)}>
                <button
                  disabled={!session}
                  aria-pressed={augment.viewerReaction === 1}
                  aria-label="Like augment"
                  onClick={() => void vote('reaction', augment.viewerReaction === 1 ? null : 1)}
                  className={`${augmentButton} ${augment.viewerReaction === 1 ? '!border-emerald-300 !text-emerald-200' : ''}`}
                >
                  <ThumbsUp size={17} />
                  {augment.upvotes}
                </button>
                </AugmentAuthHint><AugmentAuthHint authenticated={Boolean(session)}>
                <button
                  disabled={!session}
                  aria-pressed={augment.viewerReaction === -1}
                  aria-label="Dislike augment"
                  onClick={() => void vote('reaction', augment.viewerReaction === -1 ? null : -1)}
                  className={`${augmentButton} ${augment.viewerReaction === -1 ? '!border-rose-300 !text-rose-200' : ''}`}
                >
                  <ThumbsDown size={17} />
                  {augment.downvotes}
                </button>
                </AugmentAuthHint>
              </div>

          </div>
          <section className="min-w-0 space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
                {augment.rarity} · Custom augment
              </p>
              <h2 className="mt-2 break-words text-3xl font-black text-white">{augment.name}</h2>
              <p className="mt-3 text-sm text-slate-400">
                Created by{' '}
                {augment.author ? (
                  <Link
                    className="font-bold hover:underline"
                    href={`/augment-builder/binder/${augment.author.id}`}
                    style={getChatNameStyle(augment.author.chat_color)}
                  >
                    {augment.author.display_name || augment.author.username}
                  </Link>
                ) : (
                  <span>Guest</span>
                )}{' '}
                · <time dateTime={augment.createdAt}>{new Date(augment.createdAt).toLocaleDateString()}</time>
              </p>
            </div>
            <AugmentExport draft={augment} url={'/augment-builder/augment/' + id} />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Link
                href="/augment-builder/create?fresh=1"
                className={augmentButton + ' w-full !border-emerald-200/50 !bg-emerald-300 !text-slate-950 hover:!bg-emerald-200' + (session?.user.id === augment.author?.id ? ' col-span-2 sm:col-auto' : '')}
              >
                <Plus size={17} />
                Create Augment
              </Link>
              {session?.user.id === augment.author?.id ? (
                <Link href={'/augment-builder/create?edit=' + id} className={augmentButton + ' w-full'}>
                  Edit Augment
                </Link>
              ) : null}
              <Link href={'/augment-builder/create?template=' + id} className={augmentButton + ' w-full'}>
                Use augment as template
              </Link>
            </div>            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <h3 className="text-sm font-bold text-white">Community verdict</h3>
              <p className="mt-3 text-sm text-slate-400">
                Average tier:{' '}
                <strong className="text-lg text-amber-200">
                  {augment.averageTier === null ? 'Unrated' : AUGMENT_TIERS[Math.round(augment.averageTier)]}
                </strong>
                {' '}<span aria-hidden="true">{'\u00b7'}</span>{' '}{augment.tierVotes}{' '}

                {augment.tierVotes === 1 ? 'vote' : 'votes'}
              </p>
              <div className="mt-3 grid grid-cols-5 gap-2" role="group" aria-label="Vote for augment tier">
                {AUGMENT_TIERS.map((tier, index) => (<AugmentAuthHint key={tier} authenticated={Boolean(session)}>
                  <button
                    key={tier}
                    disabled={!session}
                    aria-pressed={augment.viewerTier === index}
                    onClick={() => void vote('tier', index)}
                    className={`${augmentButton} w-full ${augment.viewerTier === index ? '!border-amber-200 !bg-amber-200/10 !text-amber-200' : ''}`}
                  >
                    {tier}
                  </button>
                  </AugmentAuthHint>
                ))}
              </div>
            </section>
            {augment.questRequirements ? (
              <section>
                <h3 className="mb-2 font-bold text-white">Quest Requirements</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                  {augment.questRequirements}
                </p>
              </section>
            ) : null}
            {augment.restrictions ? (
              <section>
                <h3 className="mb-2 font-bold text-white">Restrictions</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                  {augment.restrictions}
                </p>
              </section>
            ) : null}
            {augment.longDescription ? (
              <section>
                <h3 className="mb-2 font-bold text-white">Long Description</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                  {augment.longDescription}
                </p>
              </section>
            ) : null}
            {augment.notes ? (
              <section>
                <h3 className="mb-2 font-bold text-white">Notes</h3>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{augment.notes}</p>
              </section>
            ) : null}

          </section>
        </div>
      ) : null}
    </main>
  );
}
