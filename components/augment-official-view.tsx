'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { AugmentCard } from '@/components/augment-card';
import {
  AugmentAuthHint,
  AugmentExport,
  AugmentHeader,
  augmentButton,
  augmentRequest,
  useAugmentSession,
} from '@/components/augment-shared';
import { AUGMENT_TIERS } from '@/lib/augment-builder';
import {
  officialAugmentToDraft,
  type OfficialAugment,
  type OfficialAugmentRatings,
} from '@/lib/augment-official';

const emptyRatings: OfficialAugmentRatings = {
  upvotes: 0,
  downvotes: 0,
  averageTier: null,
  tierVotes: 0,
  viewerReaction: null,
  viewerTier: null,
};


export function AugmentOfficialView({ record }: { record: OfficialAugment }) {
  const { session, resolved } = useAugmentSession();
  const [ratings, setRatings] = useState<OfficialAugmentRatings>(emptyRatings);
  const [error, setError] = useState('');
  const ratingsRef = useRef<OfficialAugmentRatings>(emptyRatings);
  const voteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const draft = officialAugmentToDraft(record);
  const detailPath = '/augment-builder/official/' + record.id;

  const applyRatings = useCallback((next: OfficialAugmentRatings) => {
    ratingsRef.current = next;
    setRatings(next);
  }, []);

  useEffect(() => {
    if (!resolved) return;
    const controller = new AbortController();
    setError('');
    void augmentRequest<{ ratings: OfficialAugmentRatings }>(
      '/api/official-augments/' + record.id,
      session,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) applyRatings(result.ratings);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unable to load community ratings.');
        }
      });
    return () => controller.abort();
  }, [applyRatings, record.id, resolved, session]);

  function vote(kind: 'reaction' | 'tier', value: number | null) {
    if (!session) return;
    const previous = ratingsRef.current;
    const currentValue = kind === 'reaction' ? previous.viewerReaction : previous.viewerTier;
    const nextValue = kind === 'reaction' && currentValue === value ? null : value;
    const nextRatings: OfficialAugmentRatings =
      kind === 'reaction'
        ? {
            ...previous,
            viewerReaction: nextValue as -1 | 1 | null,
            upvotes: Math.max(
              0,
              previous.upvotes - (previous.viewerReaction === 1 ? 1 : 0) + (nextValue === 1 ? 1 : 0),
            ),
            downvotes: Math.max(
              0,
              previous.downvotes - (previous.viewerReaction === -1 ? 1 : 0) + (nextValue === -1 ? 1 : 0),
            ),
          }
        : { ...previous, viewerTier: nextValue };
    applyRatings(nextRatings);
    const request = voteQueueRef.current
      .catch(() => undefined)
      .then(() =>
        augmentRequest<{ ratings: OfficialAugmentRatings }>(
          '/api/official-augments/' + record.id,
          session,
          {
            method: 'POST',
            body: JSON.stringify({ kind, value: nextValue }),
          },
        ),
      );
    voteQueueRef.current = request;
    void request
      .then((result) => {
        const latest = ratingsRef.current;
        const unchanged =
          kind === 'reaction' ? latest.viewerReaction === nextValue : latest.viewerTier === nextValue;
        if (!unchanged) return;
        const current = ratingsRef.current;
        applyRatings(
          kind === 'reaction'
            ? { ...result.ratings, viewerTier: current.viewerTier }
            : {
                ...result.ratings,
                viewerReaction: current.viewerReaction,
                upvotes: current.upvotes,
                downvotes: current.downvotes,
              },
        );
      })
      .catch((cause) => {
        const latest = ratingsRef.current;
        const unchanged =
          kind === 'reaction' ? latest.viewerReaction === nextValue : latest.viewerTier === nextValue;
        if (unchanged) applyRatings(previous);
        setError(cause instanceof Error ? cause.message : 'Unable to save vote.');
      });
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-10rem)] w-full max-w-5xl px-4 py-8 sm:px-6">
      <AugmentHeader
        title={record.name}
        subtitle="Official ARAM Mayhem augment"
        back="/augment-builder"
        backLabel="To Community"
        binder={session?.user.id}
      />
      {error ? (
        <p role="alert" className="mb-6 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-red-200">
          {error}
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[360px_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0 select-none space-y-3">
          <AugmentCard draft={draft} />
          <div className="mt-3 flex justify-center gap-3 sm:justify-end"><AugmentAuthHint authenticated={Boolean(session)}>
            <button
              disabled={!session}
              aria-pressed={ratings.viewerReaction === 1}
              aria-label="Like augment"
              onClick={() => void vote('reaction', ratings.viewerReaction === 1 ? null : 1)}
              className={augmentButton + (ratings.viewerReaction === 1 ? ' !border-emerald-300 !text-emerald-200' : '')}
            >
              <ThumbsUp size={17} />
              {ratings.upvotes}
            </button>
            </AugmentAuthHint><AugmentAuthHint authenticated={Boolean(session)}>
            <button
              disabled={!session}
              aria-pressed={ratings.viewerReaction === -1}
              aria-label="Dislike augment"
              onClick={() => void vote('reaction', ratings.viewerReaction === -1 ? null : -1)}
              className={augmentButton + (ratings.viewerReaction === -1 ? ' !border-rose-300 !text-rose-200' : '')}
            >
              <ThumbsDown size={17} />
              {ratings.downvotes}
            </button>
            </AugmentAuthHint>
          </div>
        </div>
        <section className="min-w-0 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-200">Official ARAM Mayhem augment</p>
            <h2 className="mt-2 break-words text-3xl font-black text-white">{record.name}</h2>
          </div>
          <AugmentExport draft={draft} url={detailPath} />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/augment-builder/create?fresh=1"
              className={augmentButton + ' w-full !border-emerald-200/50 !bg-emerald-300 !text-slate-950 hover:!bg-emerald-200 sm:w-auto'}
            >
              <Plus size={17} />
              Create Augment
            </a>
          </div>

          <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h3 className="text-sm font-bold text-white">Community verdict</h3>
            <p className="mt-3 text-sm text-slate-400">
              Average tier:{' '}
              <strong className="text-lg text-amber-200">
                {ratings.averageTier === null ? 'Unrated' : AUGMENT_TIERS[Math.round(ratings.averageTier)]}
              </strong>{' '}
              <span aria-hidden="true">&middot;</span> {ratings.tierVotes}{' '}
              {ratings.tierVotes === 1 ? 'vote' : 'votes'}
            </p>
            <div className="mt-3 grid grid-cols-5 gap-2" role="group" aria-label="Vote for augment tier">
              {AUGMENT_TIERS.map((tier, index) => (<AugmentAuthHint key={tier} authenticated={Boolean(session)}>
                <button
                  key={tier}
                  disabled={!session}
                  aria-pressed={ratings.viewerTier === index}
                  onClick={() => void vote('tier', index)}
                  className={augmentButton + ' w-full' + (ratings.viewerTier === index ? ' !border-amber-200 !bg-amber-200/10 !text-amber-200' : '')}
                >
                  {tier}
                </button>
                </AugmentAuthHint>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-bold text-white">In-depth description</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">{record.description}</p>
          </section>
        </section>
      </div>
    </main>
  );
}
