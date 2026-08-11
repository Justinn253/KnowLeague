'use client';

import { ChevronDown, LoaderCircle, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCommunityPostCard } from '@/components/riftbound-community-post-card';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getRiftboundBootstrap, type RiftboundBootstrapResponse } from '@/lib/riftbound-client';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import { createRiftboundCommunityPost, getRiftboundCommunityFeed, isRiftboundRateLimitError } from '@/lib/riftbound-community-client';
import {
  RIFTBOUND_NEW_POST_TYPES,
  RIFTBOUND_POST_BODY_MAX_LENGTH,
  type RiftboundCommunityPostSort,
  type RiftboundCommunityPostSummary,
  type RiftboundNewPostType,
} from '@/lib/riftbound-community-types';

const sortOptions: AppSelectOption<RiftboundCommunityPostSort>[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'liked-today', label: 'Most Liked · Today' },
  { value: 'liked-week', label: 'Most Liked · Weekly' },
  { value: 'liked-month', label: 'Most Liked · Monthly' },
  { value: 'liked-all', label: 'Most Liked · All Time' },
];

const postTypeLabels: Record<RiftboundNewPostType, string> = {
  general: 'General',
  question: 'Question',
  deck_build: 'Deck Build',
};

const typeOptions: AppSelectOption<string>[] = [
  { value: 'all', label: 'All Post Types' },
  ...RIFTBOUND_NEW_POST_TYPES.map((type) => ({ value: type, label: postTypeLabels[type] })),
];

const sideboardOptions: AppSelectOption<string>[] = [
  { value: 'all', label: 'Any Sideboard' },
  { value: 'true', label: 'Sideboard Present' },
  { value: 'false', label: 'No Sideboard' },
];

const COMMUNITY_VIEW_STORAGE_KEY = 'knowleague:riftbound-community-view:v1';
const COMMUNITY_SCROLL_STORAGE_KEY = 'knowleague:riftbound-community-scroll:v1';
const communitySortValues: RiftboundCommunityPostSort[] = ['recent', 'liked-today', 'liked-week', 'liked-month', 'liked-all'];

type PersistedCommunityView = {
  sort: RiftboundCommunityPostSort;
  postType: string;
  sideboard: string;
  legendFilter: string;
  battlefieldFilter: string;
  unitFilter: string;
  filtersOpen: boolean;
  posts: RiftboundCommunityPostSummary[];
  nextCursor: string | null;
};

function normalizeCommunitySort(value: string | null | undefined) {
  return value && communitySortValues.includes(value as RiftboundCommunityPostSort) ? value as RiftboundCommunityPostSort : 'recent';
}

function normalizeCommunityPostType(value: string | null | undefined) {
  return value && (value === 'all' || RIFTBOUND_NEW_POST_TYPES.includes(value as RiftboundNewPostType)) ? value : 'all';
}

function readPersistedCommunityView() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(COMMUNITY_VIEW_STORAGE_KEY) ?? 'null') as Partial<PersistedCommunityView> | null;
    if (!parsed || !Array.isArray(parsed.posts)) return null;
    return {
      sort: normalizeCommunitySort(parsed.sort),
      postType: normalizeCommunityPostType(parsed.postType),
      sideboard: parsed.sideboard === 'true' || parsed.sideboard === 'false' ? parsed.sideboard : 'all',
      legendFilter: typeof parsed.legendFilter === 'string' ? parsed.legendFilter : '',
      battlefieldFilter: typeof parsed.battlefieldFilter === 'string' ? parsed.battlefieldFilter : '',
      unitFilter: typeof parsed.unitFilter === 'string' ? parsed.unitFilter : '',
      filtersOpen: parsed.filtersOpen === true,
      posts: parsed.posts,
      nextCursor: typeof parsed.nextCursor === 'string' ? parsed.nextCursor : null,
    } satisfies PersistedCommunityView;
  } catch {
    return null;
  }
}

function readCommunityScrollPosition() {
  if (typeof window === 'undefined') return null;
  try {
    const value = Number(window.sessionStorage.getItem(COMMUNITY_SCROLL_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveCommunityScrollPosition() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(COMMUNITY_SCROLL_STORAGE_KEY, String(Math.max(0, window.scrollY)));
  } catch {
    // Session storage is optional; feed navigation still works without it.
  }
}

function resolveCardFilter(value: string) {
  const cleanValue = value.trim().toLowerCase();
  if (!cleanValue) return null;
  const card = RIFTBOUND_CARDS.find((candidate) => candidate.id.toLowerCase() === cleanValue || candidate.displayName.toLowerCase() === cleanValue);
  return card?.id ?? null;
}

function getRiftboundCardByFilter(value: string) {
  const cardId = resolveCardFilter(value);
  return cardId ? RIFTBOUND_CARDS.find((card) => card.id === cardId) ?? null : null;
}

export function RiftboundCommunity() {
  const [session, setSession] = useState<Session | null>(null);
  const [posts, setPosts] = useState<RiftboundCommunityPostSummary[]>([]);
  const [sort, setSort] = useState<RiftboundCommunityPostSort>('recent');
  const [postType, setPostType] = useState('all');
  const [sideboard, setSideboard] = useState('all');
  const [legendFilter, setLegendFilter] = useState('');
  const [battlefieldFilter, setBattlefieldFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceData, setSourceData] = useState<RiftboundBootstrapResponse | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [composerType, setComposerType] = useState<RiftboundNewPostType>('general');
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('public');
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState('');
  const [viewReady, setViewReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const requestIdRef = useRef(0);
  const nextCursorRef = useRef<string | null>(null);
  const sourceLoadUserIdRef = useRef<string | null>(null);
  const restoredFeedRef = useRef(false);
  const restoreScrollRef = useRef<number | null>(null);

  const viewStateRef = useRef<PersistedCommunityView>({
    sort,
    postType,
    sideboard,
    legendFilter,
    battlefieldFilter,
    unitFilter,
    filtersOpen,
    posts,
    nextCursor,
  });
  viewStateRef.current = { sort, postType, sideboard, legendFilter, battlefieldFilter, unitFilter, filtersOpen, posts, nextCursor };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stored = readPersistedCommunityView();
    const hasFilterQuery = Array.from(params.keys()).length > 0;
    const queryView = {
      sort: normalizeCommunitySort(params.get('sort')),
      postType: normalizeCommunityPostType(params.get('type')),
      sideboard: params.get('sideboard') === 'true' || params.get('sideboard') === 'false' ? params.get('sideboard') as string : 'all',
      legendFilter: params.get('legend') ?? '',
      battlefieldFilter: params.get('battlefield') ?? '',
      unitFilter: params.get('unit') ?? '',
      filtersOpen: params.get('filters') === '1',
    };
    const source = hasFilterQuery ? queryView : stored ?? queryView;
    setSort(source.sort);
    setPostType(source.postType);
    setSideboard(source.sideboard);
    setLegendFilter(source.legendFilter);
    setBattlefieldFilter(source.battlefieldFilter);
    setUnitFilter(source.unitFilter);
    setFiltersOpen(source.filtersOpen);

    const storedMatchesQuery = !hasFilterQuery || !stored || (
      stored.sort === queryView.sort
      && stored.postType === queryView.postType
      && stored.sideboard === queryView.sideboard
      && stored.legendFilter === queryView.legendFilter
      && stored.battlefieldFilter === queryView.battlefieldFilter
      && stored.unitFilter === queryView.unitFilter
    );
    if (stored && storedMatchesQuery && stored.posts.length > 0) {
      setPosts(stored.posts);
      setNextCursor(stored.nextCursor);
      nextCursorRef.current = stored.nextCursor;
      restoredFeedRef.current = true;
      restoreScrollRef.current = readCommunityScrollPosition();
      setLoading(false);
    }
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    const params = new URLSearchParams();
    if (sort !== 'recent') params.set('sort', sort);
    if (postType !== 'all') params.set('type', postType);
    if (sideboard !== 'all') params.set('sideboard', sideboard);
    if (legendFilter) params.set('legend', legendFilter);
    if (battlefieldFilter) params.set('battlefield', battlefieldFilter);
    if (unitFilter) params.set('unit', unitFilter);
    if (filtersOpen) params.set('filters', '1');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [battlefieldFilter, filtersOpen, legendFilter, postType, sideboard, sort, unitFilter, viewReady]);

  useEffect(() => {
    if (!viewReady) return;
    try {
      window.sessionStorage.setItem(COMMUNITY_VIEW_STORAGE_KEY, JSON.stringify(viewStateRef.current));
    } catch {
      // Session storage is optional; feed navigation still works without it.
    }
  }, [battlefieldFilter, filtersOpen, legendFilter, nextCursor, postType, posts, sideboard, sort, unitFilter, viewReady]);

  useEffect(() => {
    const handleScroll = () => {
      saveCommunityScrollPosition();
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', handleScroll);
    return () => {
      saveCommunityScrollPosition();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!viewReady || restoreScrollRef.current === null) return undefined;
    const target = restoreScrollRef.current;
    let frame = 0;
    let retryTimeout: number | null = null;
    let attempts = 0;
    const restore = () => {
      if (restoreScrollRef.current === null) return;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const nextScroll = Math.min(target, maxScroll);
      window.scrollTo(0, nextScroll);
      attempts += 1;
      if (nextScroll >= target || attempts >= 30) {
        restoreScrollRef.current = null;
        return;
      }
      retryTimeout = window.setTimeout(restore, 100);
    };
    frame = window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryTimeout !== null) window.clearTimeout(retryTimeout);
    };
  }, [loading, posts.length, viewReady]);

  useEffect(() => subscribeToAuthSession((nextSession) => {
    setSession(nextSession);
    setAuthResolved(true);
  }), []);

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams({ sort, limit: '20' });
    if (postType !== 'all') params.set('type', postType);
    if (sideboard !== 'all') params.set('sideboard', sideboard);
    if (postType === 'deck_build' && legendFilter) params.set('legend', legendFilter);
    const unitCard = getRiftboundCardByFilter(unitFilter);
    if (unitCard) {
      if (unitCard.cardType === 'Legend') params.set('legend', unitCard.id);
      else params.set(unitCard.cardTypeLabels.includes('Champion') ? 'champion' : 'unit', unitCard.id);
    }
    const battlefieldCardId = resolveCardFilter(battlefieldFilter);
    if (battlefieldCardId) params.set('battlefield', battlefieldCardId);
    return `/api/riftbound/community/feed?${params.toString()}`;
  }, [battlefieldFilter, legendFilter, postType, sideboard, sort, unitFilter]);

  const loadFeed = useCallback(async (append = false, preserveExisting = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (append) setLoadingMore(true);
    else if (!preserveExisting) setLoading(true);
    setError('');
    try {
      const cursor = nextCursorRef.current;
      const url = append && cursor ? `${feedUrl}&cursor=${encodeURIComponent(cursor)}` : feedUrl;
      const data = await getRiftboundCommunityFeed(url, session);
      if (requestId !== requestIdRef.current) return;
      setPosts((current) => {
        if (append) return [...current, ...data.posts];
        if (!preserveExisting) return data.posts;
        const freshPostIds = new Set(data.posts.map((post) => post.id));
        return [...data.posts, ...current.filter((post) => !freshPostIds.has(post.id))];
      });
      const nextCursor = preserveExisting ? nextCursorRef.current ?? data.nextCursor : data.nextCursor;
      nextCursorRef.current = nextCursor;
      setNextCursor(nextCursor);
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load the Riftbound community.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [feedUrl, session]);

  useEffect(() => {
    if (!viewReady || !authResolved) return;
    const preserveExisting = restoredFeedRef.current;
    restoredFeedRef.current = false;
    if (!preserveExisting) {
      nextCursorRef.current = null;
      setNextCursor(null);
    }
    void loadFeed(false, preserveExisting);
  }, [authResolved, feedUrl, loadFeed, viewReady]);

  useEffect(() => {
    if (!session) {
      sourceLoadUserIdRef.current = null;
      setSourceData(null);
      return;
    }
    if (!createOpen || composerType !== 'deck_build' || sourceLoadUserIdRef.current === session.user.id) return;

    sourceLoadUserIdRef.current = session.user.id;
    setSourceData(null);
    setSourceLoading(true);
    void getRiftboundBootstrap(session)
      .then((data) => setSourceData(data))
      .catch((loadError: unknown) => setPostError(loadError instanceof Error ? loadError.message : 'Unable to load your Riftbound decks.'))
      .finally(() => setSourceLoading(false));
  }, [composerType, createOpen, session]);

  const deckOptions = useMemo<AppSelectOption<string>[]>(() => [
    { value: '', label: 'Select a deck' },
    ...(sourceData?.decks?.decks ?? []).map((deck) => ({ value: deck.id, label: deck.name })),
  ], [sourceData]);

  const legendOptions = useMemo<AppSelectOption<string>[]>(() => [
    { value: '', label: 'All Legends' },
    ...RIFTBOUND_CARDS
      .filter((card) => card.cardType === 'Legend')
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map((card) => ({ value: card.id, label: card.displayName })),
  ], []);

  const publishPost = async () => {
    if (!session || postSaving) return;
    if (composerType === 'deck_build' && !selectedDeckId) {
      setPostError('Select a deck before publishing a Deck Build post.');
      return;
    }
    setPostSaving(true);
    setPostError('');
    try {
      const data = await createRiftboundCommunityPost({
        postType: composerType,
        sourceId: composerType === 'deck_build' ? selectedDeckId : null,
        title: postTitle,
        body: postBody,
        visibility: postVisibility,
      }, session);
      setPosts((current) => [data.post, ...current]);
      setCreateOpen(false);
      setComposerType('general');
      setSelectedDeckId('');
      setPostTitle('');
      setPostBody('');
      setPostVisibility('public');
    } catch (saveError) {
      setPostError(isRiftboundRateLimitError(saveError) ? '' : saveError instanceof Error ? saveError.message : 'Unable to publish this post.');
    } finally {
      setPostSaving(false);
    }
  };

  const updatePost = (nextPost: RiftboundCommunityPostSummary) => {
    setPosts((current) => current.map((post) => post.id === nextPost.id ? nextPost : post));
  };

  const activeFilterCount = [postType !== 'all', sideboard !== 'all', postType === 'deck_build' && Boolean(legendFilter), battlefieldFilter.trim(), unitFilter.trim()].filter(Boolean).length;

  return (
    <main
      className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10"
      aria-label="Riftbound community"
      onPointerDownCapture={saveCommunityScrollPosition}
      onClickCapture={saveCommunityScrollPosition}
      onKeyDownCapture={saveCommunityScrollPosition}
    >
      <section className="mx-auto grid w-full max-w-[1600px] gap-5">
        <section className="overflow-visible rounded-3xl border border-amber-200/20 bg-slate-950/80" aria-label="Create a new community post">
          <button
            type="button"
            aria-expanded={createOpen}
            aria-controls="riftbound-post-composer"
            onClick={() => { setCreateOpen((current) => !current); setPostError(''); }}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-900/60 sm:px-6"
          >
            <span className="flex min-w-0 items-center gap-3"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/30 bg-amber-300/10 text-amber-200"><Plus size={18} /></span><span className="text-xl font-black text-white">Create a new post</span></span>
            <ChevronDown size={20} className={`shrink-0 text-slate-400 transition ${createOpen ? 'rotate-180 text-amber-200' : ''}`} />
          </button>

          {createOpen ? (
            <div id="riftbound-post-composer" className="grid gap-4 border-t border-white/10 p-5 sm:p-6">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Title</span><input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} maxLength={80} placeholder="Give your post a title" className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /></label>
                <fieldset className="grid gap-2"><legend className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Visibility</legend><div className="inline-flex h-12 rounded-2xl border border-white/10 bg-slate-900 p-1"><button type="button" onClick={() => setPostVisibility('public')} className={`rounded-xl px-3 text-xs font-black transition ${postVisibility === 'public' ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}>Public</button><button type="button" onClick={() => setPostVisibility('friends')} className={`rounded-xl px-3 text-xs font-black transition ${postVisibility === 'friends' ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}>Friends Only</button></div></fieldset>
              </div>
              <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Body</span><textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} maxLength={RIFTBOUND_POST_BODY_MAX_LENGTH} rows={4} placeholder="Share something with the Riftbound community" className="resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /></label>
              <div className="grid gap-3 md:grid-cols-2">
                <AppSelectMenu label="Post Type" value={composerType} options={RIFTBOUND_NEW_POST_TYPES.map((type) => ({ value: type, label: postTypeLabels[type] }))} onChange={(value) => { setComposerType(value); setSelectedDeckId(''); setPostTitle(''); }} menuClassName="min-w-[16rem] max-w-[calc(100vw-2rem)]" />
                {composerType === 'deck_build' ? <AppSelectMenu label="Select a Deck" value={selectedDeckId} options={deckOptions} onChange={setSelectedDeckId} disabled={sourceLoading || deckOptions.length <= 1} disabledDescription={sourceLoading ? 'Loading your decks...' : 'Create a deck before publishing a Deck Build post.'} menuClassName="min-w-[16rem] max-w-[calc(100vw-2rem)]" /> : <div aria-hidden="true" />}
              </div>
              {sourceLoading ? <p className="text-sm text-slate-500">Loading your decks...</p> : null}
              {postError ? <p className="rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-200">{postError}</p> : null}
              <div className="flex justify-end"><button type="button" onClick={() => void publishPost()} disabled={!session || postSaving || sourceLoading || (composerType === 'deck_build' && !selectedDeckId)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">{postSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} {session ? 'Publish Post' : 'Sign in to post'}</button></div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-2" aria-label="Community feed controls">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/40 p-2">
            <AppSelectMenu label="Sort" hideLabel value={sort} options={sortOptions} onChange={setSort} className="min-w-[10rem] flex-1 sm:flex-none" triggerClassName="h-10 min-h-10 rounded-xl px-3 pr-3" menuClassName="min-w-[16rem] max-w-[calc(100vw-1rem)]" />
            <AppSelectMenu label="Post Type" hideLabel value={postType} options={typeOptions} onChange={(value) => { setPostType(value); if (value !== 'deck_build') setLegendFilter(''); }} className="min-w-[10rem] flex-1 sm:flex-none" triggerClassName="h-10 min-h-10 rounded-xl px-3 pr-3" menuPlacement="right" menuClassName="min-w-[16rem] max-w-[calc(100vw-1rem)]" />
            {postType === 'deck_build' ? <AppSelectMenu label="Legend" hideLabel value={legendFilter} options={legendOptions} onChange={setLegendFilter} optionsClassName="grid-cols-1 sm:grid-cols-3" className="min-w-[11rem] flex-1 sm:flex-none" triggerClassName="h-10 min-h-10 rounded-xl px-3 pr-3" menuClassName="min-w-[18rem] max-w-[calc(100vw-1rem)]" /> : null}
            <button type="button" onClick={() => setFiltersOpen((current) => !current)} aria-label={filtersOpen ? 'Close community filters' : 'Open community filters'} aria-expanded={filtersOpen} title={filtersOpen ? 'Close filters' : 'Open filters'} className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${filtersOpen ? 'border-amber-300 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-slate-950 text-slate-400 hover:border-amber-200/50 hover:text-amber-200'}`}><SlidersHorizontal size={17} />{activeFilterCount > 0 ? <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-300 px-1 text-[0.58rem] font-black text-slate-950">{activeFilterCount}</span> : null}</button>
          </div>
          {filtersOpen ? (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-3 md:grid-cols-3">
              {[
                ['Legend / Unit', unitFilter, setUnitFilter],
                ['Battlefield', battlefieldFilter, setBattlefieldFilter],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label as string}</span><input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder="Exact card name or id" className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /></label>
              ))}
              <AppSelectMenu label="Sideboard" value={sideboard} options={sideboardOptions} onChange={setSideboard} triggerClassName="h-10 min-h-10 rounded-xl" />
            </div>
          ) : null}
        </section>

        {loading ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading the community feed...</section> : error ? <section className="grid gap-3 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error}</p><button type="button" onClick={() => void loadFeed(false)} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-red-200/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em]"><RefreshCw size={14} /> Try Again</button></section> : posts.length === 0 ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">No community posts match these filters yet.</section> : <div className="grid gap-4">{posts.map((post) => <RiftboundCommunityPostCard key={post.id} post={post} session={session} onPostChange={updatePost} />)}</div>}

        {!loading && nextCursor ? <button type="button" onClick={() => void loadFeed(true)} disabled={loadingMore} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60">{loadingMore ? <LoaderCircle size={16} className="animate-spin" /> : null} Load More</button> : null}
      </section>
    </main>
  );
}
