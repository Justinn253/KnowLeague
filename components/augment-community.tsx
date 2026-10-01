'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Check, Copy, LoaderCircle, Plus, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu } from '@/components/app-select-menu';
import { AugmentCard } from '@/components/augment-card';
import {
  AugmentAuthHint,
  AugmentHeader,
  augmentButton,
  augmentInput,
  augmentRequest,
  cacheAugmentView,
  copyAugmentImage,
  useAugmentSession,
} from '@/components/augment-shared';
import {
  AUGMENT_COMMUNITY_TIER_FILTERS,
  AUGMENT_TIERS,
  type AugmentCommunitySort,
  type AugmentCommunityTierFilter,
  type PublishedAugment,
} from '@/lib/augment-builder';
import { getChatNameStyle } from '@/lib/chat-colors';

type CommunityResponse = { augments: PublishedAugment[]; hasMore: boolean };
type CommunityReaction = 1 | -1 | null;
const AugmentOfficialArchive = dynamic(() => import('@/components/augment-official-archive').then((module) => module.AugmentOfficialArchive), {
  ssr: false,
  loading: () => <div role="status" className="min-h-[42rem] py-20 text-center text-slate-400">Loading official archive...</div>,
});

const sortOptions = [
  { value: 'newest' as const, label: 'Newest' },
  { value: 'week' as const, label: 'Top (week)' },
  { value: 'month' as const, label: 'Top (month)' },
  { value: 'year' as const, label: 'Top (year)' },
  { value: 'all' as const, label: 'Top (all time)' },
];

const tierFilterOptions = [
  { value: 'unrated' as const, label: 'Tier Unrated' },
  ...AUGMENT_TIERS.map((tier) => ({ value: tier, label: 'Tier ' + tier })),
  { value: 'all' as const, label: 'All' },
];

function parseTierFilters(value: string | null): AugmentCommunityTierFilter[] {
  const selected = (value ?? '').split(',').filter((item): item is AugmentCommunityTierFilter =>
    AUGMENT_COMMUNITY_TIER_FILTERS.includes(item as AugmentCommunityTierFilter),
  );
  if (!selected.length || selected.includes('all')) return ['all'];
  return [...new Set(selected)];
}

function tierLabel(augment: PublishedAugment) {
  return augment.averageTier === null ? 'Unrated' : AUGMENT_TIERS[Math.round(augment.averageTier)];
}

type AugmentCommunityCardProps = {
  augment: PublishedAugment;
  session: Session | null;
  onChange: (augment: PublishedAugment) => void;
  onError: (message: string) => void;
};

function AugmentCommunityCard({ augment, session, onChange, onError }: AugmentCommunityCardProps) {
  const router = useRouter();
  const [localAugment, setLocalAugment] = useState(augment);
  const localRef = useRef(augment);
  const requestRef = useRef<Promise<unknown>>(Promise.resolve());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    localRef.current = augment;
    setLocalAugment(augment);
  }, [augment]);
  function apply(next: PublishedAugment) {
    localRef.current = next;
    setLocalAugment(next);
    onChange(next);
    cacheAugmentView(next, session?.user.id ?? null);
  }
  function updateReaction(nextReaction: Exclude<CommunityReaction, null>) {
    if (!session) return;
    const previous = localRef.current;
    const currentReaction = previous.viewerReaction as CommunityReaction;
    const nextValue: CommunityReaction = currentReaction === nextReaction ? null : nextReaction;
    const nextAugment: PublishedAugment = {
      ...previous,
      viewerReaction: nextValue,
      upvotes: Math.max(0, previous.upvotes - (currentReaction === 1 ? 1 : 0) + (nextValue === 1 ? 1 : 0)),
      downvotes: Math.max(0, previous.downvotes - (currentReaction === -1 ? 1 : 0) + (nextValue === -1 ? 1 : 0)),
    };
    apply(nextAugment);
    const request = requestRef.current
      .catch(() => undefined)
      .then(() => augmentRequest<{ augment: PublishedAugment }>('/api/augments/' + previous.id, session, {
        method: 'POST',
        body: JSON.stringify({ kind: 'reaction', value: nextValue }),
      }));
    requestRef.current = request;
    void request
      .then((result) => {
        if (localRef.current.viewerReaction === nextValue) apply(result.augment);
      })
      .catch(() => {
        if (localRef.current.viewerReaction !== nextValue) return;
        apply(previous);
        onError('Unable to save that reaction.');
      });
  }
  async function copyCard(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    try {
      await copyAugmentImage(localRef.current);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      onError('Could not copy the augment card. Check browser clipboard permissions.');
    }
  }
  function openCard() {
    router.push('/augment-builder/augment/' + localAugment.id);
  }
  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    openCard();
  }
  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={'View augment ' + localAugment.name}
      onClick={openCard}
      onKeyDown={handleCardKeyDown}
      className="group flex min-w-0 select-none cursor-pointer flex-col rounded-2xl border border-white/10 bg-slate-900/40 p-4 transition hover:border-amber-200/60 hover:bg-slate-900/70 focus:outline-none focus:ring-2 focus:ring-amber-200"
    >
      <div className="mb-3 flex min-h-8 min-w-0 items-center justify-between gap-2 text-sm font-bold text-slate-100">
        <span
          className="block truncate"
          style={localAugment.author ? getChatNameStyle(localAugment.author.chat_color) : undefined}
        >
          {localAugment.author?.display_name || localAugment.author?.username || 'Community creator'}
        </span>
        <button
          type="button"
          aria-label="Copy augment card"
          title="Copy augment card"
          onClick={copyCard}
          className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 text-slate-400 transition hover:border-amber-200/60 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <AugmentCard draft={localAugment} />
      </div>
      <div className="mt-3 border-t border-white/10 pt-3 text-xs font-bold text-slate-400">
        <div className="flex items-center justify-between gap-3">
          <span>Tier {tierLabel(localAugment)}</span>
          <div className="flex justify-end gap-2">
            <AugmentAuthHint authenticated={Boolean(session)}>
              <button
                type="button"
                disabled={!session}
                aria-pressed={localAugment.viewerReaction === 1}
                aria-label="Like augment"
                onClick={(event) => { event.stopPropagation(); updateReaction(1); }}
                className={'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ' + (localAugment.viewerReaction === 1 ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-emerald-200/40 hover:text-emerald-200')}
              >
                <ThumbsUp size={14} />
                {localAugment.upvotes}
              </button>
            </AugmentAuthHint>
            <AugmentAuthHint authenticated={Boolean(session)}>
              <button
                type="button"
                disabled={!session}
                aria-pressed={localAugment.viewerReaction === -1}
                aria-label="Dislike augment"
                onClick={(event) => { event.stopPropagation(); updateReaction(-1); }}
                className={'inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ' + (localAugment.viewerReaction === -1 ? 'border-rose-300/50 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-rose-200/40 hover:text-rose-200')}
              >
                <ThumbsDown size={14} />
                {localAugment.downvotes}
              </button>
            </AugmentAuthHint>
          </div>
        </div>
      </div>    </article>
  );
}

export function AugmentCommunity() {
  const { session, resolved } = useAugmentSession();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const initialSort = searchParams.get('sort');
  const initialTiers = parseTierFilters(searchParams.get('tiers'));
  const initialPage = Number.parseInt(searchParams.get('page') ?? '0', 10);
  const [tab, setTab] = useState<'community' | 'official'>(() => initialTab === 'official' ? 'official' : 'community');
  const [sort, setSort] = useState<AugmentCommunitySort>(() => sortOptions.some((option) => option.value === initialSort) ? initialSort as AugmentCommunitySort : 'newest');
  const [tierFilters, setTierFilters] = useState<AugmentCommunityTierFilter[]>(initialTiers);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [page, setPage] = useState(() => Number.isFinite(initialPage) && initialPage >= 0 ? initialPage : 0);
  const [feed, setFeed] = useState<CommunityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === 'official') params.set('tab', 'official'); else params.delete('tab');
    if (search) params.set('q', search); else params.delete('q');
    if (sort !== 'newest') params.set('sort', sort); else params.delete('sort');
    if (tierFilters.includes('all')) params.delete('tiers'); else params.set('tiers', tierFilters.join(','));
    if (page > 0) params.set('page', String(page)); else params.delete('page');
    const next = params.toString();
    window.history.replaceState(null, '', '/augment-builder' + (next ? '?' + next : ''));
  }, [page, search, sort, tab, tierFilters]);


  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(0);
      setQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!resolved || tab !== 'community') return;
    const controller = new AbortController();
    const params = new URLSearchParams({ sort, page: String(page) });
    if (query) params.set('q', query);
    if (!tierFilters.includes('all')) params.set('tiers', tierFilters.join(','));
    setLoading(true);
    setError('');
    void augmentRequest<CommunityResponse>('/api/augments?' + params.toString(), session, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        result.augments.forEach((augment) => cacheAugmentView(augment, session?.user.id ?? null));
        setFeed(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load community augments.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query, resolved, session, sort, tab, tierFilters]);

  function updateFeedAugment(next: PublishedAugment) {
    setFeed((current) => current ? { ...current, augments: current.augments.map((item) => item.id === next.id ? next : item) } : current);
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <AugmentHeader
        title="Community Augments"
        subtitle="Browse custom or official augments."
        back="/games"
      />
      <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-xl font-black text-white">{tab === 'official' ? 'Official Augments' : 'Community Augments'}</h2>
          <p className="mt-1 text-sm text-slate-400">{tab === 'official' ? 'Browse current official augments.' : 'View augments created by the community.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/augment-builder/create?fresh=1"
            className={`${augmentButton} !border-emerald-200/50 !bg-emerald-300 !text-slate-950 hover:!bg-emerald-200`}
          >
            <Plus size={17} />
            Create Augment
          </Link>
          <Link href={session ? `/augment-builder/binder/${session.user.id}` : '/login'} className={augmentButton}>
            <BookOpen size={17} />
            My Augments
          </Link>
        </div>
      </section>
      <div role="tablist" aria-label="Augment library" className="mb-6 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {([
          ['community', 'Community Augments'],
          ['official', 'Official Augments'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={'rounded-xl border px-4 py-2 text-sm font-bold transition ' + (tab === value ? 'border-amber-200/70 bg-amber-200/10 text-amber-100' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-white/30 hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'official' ? <AugmentOfficialArchive /> : <>
      <section aria-label="Community augment filters" className="mb-8 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <label className="relative block">
          <span className="sr-only">Search augments by name</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search augments by name..."
            className={`${augmentInput} pl-10`}
            maxLength={80}
          />
        </label>
        <AppSelectMenu
          label="Sort"
          hideLabel
          value={sort}
          options={sortOptions}
          onChange={(value) => {
            setSort(value);
            setPage(0);
          }}
        />
        <AppSelectMenu
          label="Tier"
          hideLabel
          multiple
          value={tierFilters[0] ?? 'all'}
          selectedValues={tierFilters}
          options={tierFilterOptions}
          onToggle={(value) => {
            setTierFilters((current) => {
              if (value === 'all') return ['all'];
              const withoutAll = current.filter((tier) => tier !== 'all');
              const next = withoutAll.includes(value)
                ? withoutAll.filter((tier) => tier !== value)
                : [...withoutAll, value];
              return next.length ? next : ['all'];
            });
            setPage(0);
          }}
        />
      </section>
      {error ? (
        <p role="alert" className="mb-6 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-red-200">
          {error}
        </p>
      ) : null}
      {loading && !feed ? (
        <div role="status" className="flex min-h-[34rem] items-center justify-center gap-3 py-20 text-slate-400">
          <LoaderCircle size={22} className="animate-spin text-amber-200" aria-hidden="true" />
          Loading community augments...
        </div>
      ) : null}
      {!loading && feed?.augments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400">
          {query ? 'No augments match that name.' : 'No account-owned augments have been published yet.'}
        </div>
      ) : null}
      {feed?.augments.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {feed.augments.map((augment) => (
            <AugmentCommunityCard
              key={augment.id}
              augment={augment}
              session={session}
              onChange={updateFeedAugment}
              onError={setError}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-8 flex items-center justify-center gap-4">
        <button className={augmentButton} disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {page + 1}</span>
        <button className={augmentButton} disabled={loading || !feed?.hasMore} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
      <p className="mt-8 text-center text-xs text-slate-600">Only published augments from account holders appear in this community hub.</p>
      </>}
    </main>
  );
}

