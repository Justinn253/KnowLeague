'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { AppSelectMenu } from '@/components/app-select-menu';
import { AugmentCard } from '@/components/augment-card';
import { AugmentAuthHint, augmentButton, augmentInput, augmentRequest, useAugmentSession } from '@/components/augment-shared';
import officialCatalogue from '@/data/catalogs/official-augments.json';
import { AUGMENT_RARITIES, AUGMENT_TIERS, type AugmentRarity } from '@/lib/augment-builder';
import { officialAugmentToDraft, type OfficialAugment, type OfficialAugmentRatings } from '@/lib/augment-official';

type ArchiveFilter = 'all' | AugmentRarity;
const PAGE_SIZE = 24;
const filterOptions = [
  { value: 'all' as const, label: 'All' },
  { value: 'silver' as const, label: 'Silver' },
  { value: 'gold' as const, label: 'Gold' },
  { value: 'prismatic' as const, label: 'Prismatic' },
];
const emptyRatings = (): OfficialAugmentRatings => ({
  upvotes: 0,
  downvotes: 0,
  averageTier: null,
  tierVotes: 0,
  viewerReaction: null,
  viewerTier: null,
});

function recordMatches(record: OfficialAugment, query: string, filter: ArchiveFilter) {
  if (!record.current) return false;
  if (AUGMENT_RARITIES.includes(filter as AugmentRarity) && record.rarity !== filter) return false;
  if (!query) return true;
  const haystack = (record.name + ' ' + (record.shortDescription || record.description)).toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function ratingTier(rating: OfficialAugmentRatings) {
  return rating.averageTier === null ? 'Unrated' : AUGMENT_TIERS[Math.round(rating.averageTier)];
}

export function AugmentOfficialArchive() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, resolved } = useAugmentSession();
  const initialFilter = searchParams.get('officialFilter');
  const initialPage = Number.parseInt(searchParams.get('officialPage') ?? '0', 10);
  const [search, setSearch] = useState(() => searchParams.get('officialSearch') ?? '');
  const [filter, setFilter] = useState<ArchiveFilter>(() =>
    filterOptions.some((option) => option.value === initialFilter) ? initialFilter as ArchiveFilter : 'all',
  );
  const [page, setPage] = useState(() => Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0);
  const [ratings, setRatings] = useState<Record<string, OfficialAugmentRatings>>({});
  const filtered = useMemo(
    () => officialCatalogue.augments.filter((record) => recordMatches(record, search.trim(), filter)),
    [filter, search],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set('officialSearch', search); else params.delete('officialSearch');
    if (filter !== 'all') params.set('officialFilter', filter); else params.delete('officialFilter');
    if (page > 0) params.set('officialPage', String(page)); else params.delete('officialPage');
    const next = params.toString();
    window.history.replaceState(null, '', '/augment-builder' + (next ? '?' + next : ''));
  }, [filter, page, search]);

  useEffect(() => {
    if (!resolved || !visible.length) return;
    const controller = new AbortController();
    const ids = visible.map((record) => record.id).join(',');
    void augmentRequest<{ ratings: Record<string, OfficialAugmentRatings> }>(
      '/api/official-augments?ids=' + encodeURIComponent(ids),
      session,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setRatings((current) => ({ ...current, ...result.ratings }));
      })
      .catch(() => {
        // The card remains usable if ratings are temporarily unavailable.
      });
    return () => controller.abort();
  }, [resolved, session, visible]);

  function openCard(record: OfficialAugment) {
    router.push('/augment-builder/official/' + record.id);
  }

  function updateReaction(record: OfficialAugment, nextReaction: -1 | 1) {
    if (!session) return;
    const previous = ratings[record.id] ?? emptyRatings();
    const nextValue = previous.viewerReaction === nextReaction ? null : nextReaction;
    const optimistic: OfficialAugmentRatings = {
      ...previous,
      viewerReaction: nextValue,
      upvotes: Math.max(0, previous.upvotes - (previous.viewerReaction === 1 ? 1 : 0) + (nextValue === 1 ? 1 : 0)),
      downvotes: Math.max(0, previous.downvotes - (previous.viewerReaction === -1 ? 1 : 0) + (nextValue === -1 ? 1 : 0)),
    };
    setRatings((current) => ({ ...current, [record.id]: optimistic }));
    void augmentRequest<{ ratings: OfficialAugmentRatings }>('/api/official-augments/' + record.id, session, {
      method: 'POST',
      body: JSON.stringify({ kind: 'reaction', value: nextValue }),
    }).then((result) => {
      setRatings((current) => current[record.id]?.viewerReaction === nextValue ? { ...current, [record.id]: result.ratings } : current);
    }).catch(() => {
      setRatings((current) => ({ ...current, [record.id]: previous }));
    });
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, record: OfficialAugment) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openCard(record);
  }

  return (
    <section aria-label="Official augment archive">
      <section aria-label="Official augment filters" className="mb-8 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="relative block">
            <span className="sr-only">Search official augments</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search official augments..."
              className={augmentInput + ' pl-10'}
            />
          </label>
          <AppSelectMenu
            label="Filter"
            hideLabel
            value={filter}
            options={filterOptions}
            onChange={(value) => {
              setFilter(value);
              setPage(0);
            }}
          />
      </section>
      {visible.length ? (
        <div className="grid min-h-[34rem] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((record) => {
            const rating = ratings[record.id] ?? emptyRatings();
            return (
              <article
                role="link"
                tabIndex={0}
                aria-label={'View official augment ' + record.name}
                key={record.id}
                onClick={() => openCard(record)}
                onKeyDown={(event) => handleCardKeyDown(event, record)}
                className="group flex min-w-0 select-none cursor-pointer flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-4 transition hover:border-amber-200/60 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <div className="min-w-0 flex-1">
                  <AugmentCard draft={officialAugmentToDraft(record)} />
                </div>
                <div className="mt-3 border-t border-white/10 pt-3 text-xs font-bold text-slate-400">
                  <div className="flex items-center justify-between gap-3">
                    <span>Tier {ratingTier(rating)}</span>
                    <div className="flex justify-end gap-2">
                      <AugmentAuthHint authenticated={Boolean(session)}>
                        <button
                          type="button"
                          disabled={!session}
                          aria-pressed={rating.viewerReaction === 1}
                          aria-label="Like official augment"
                          onClick={(event) => { event.stopPropagation(); updateReaction(record, 1); }}
                          className={'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ' + (rating.viewerReaction === 1 ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-emerald-200/40 hover:text-emerald-200')}
                        >
                          <ThumbsUp size={14} />
                          {rating.upvotes}
                        </button>
                      </AugmentAuthHint>
                      <AugmentAuthHint authenticated={Boolean(session)}>
                        <button
                          type="button"
                          disabled={!session}
                          aria-pressed={rating.viewerReaction === -1}
                          aria-label="Dislike official augment"
                          onClick={(event) => { event.stopPropagation(); updateReaction(record, -1); }}
                          className={'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ' + (rating.viewerReaction === -1 ? 'border-rose-300/50 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-rose-200/40 hover:text-rose-200')}
                        >
                          <ThumbsDown size={14} />
                          {rating.downvotes}
                        </button>
                      </AugmentAuthHint>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400">
          No official augments match that search.
        </div>
      )}
      <div className="mt-8 flex items-center justify-center gap-4">
        <button className={augmentButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {currentPage + 1} / {pageCount}</span>
        <button className={augmentButton} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}
