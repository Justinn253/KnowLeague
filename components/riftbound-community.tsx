'use client';

import Link from 'next/link';
import { Home, LoaderCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCommunityPostCard } from '@/components/riftbound-community-post-card';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getRiftboundBootstrap, type RiftboundBootstrapResponse } from '@/lib/riftbound-client';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import {
  createRiftboundCommunityPost,
  getRiftboundCommunityFeed,
} from '@/lib/riftbound-community-client';
import {
  RIFTBOUND_POST_TYPES,
  type RiftboundCommunityPostSort,
  type RiftboundCommunityPostSummary,
} from '@/lib/riftbound-community-types';

const sortOptions: AppSelectOption<RiftboundCommunityPostSort>[] = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'liked-today', label: 'Most Liked · Today' },
  { value: 'liked-week', label: 'Most Liked · Weekly' },
  { value: 'liked-month', label: 'Most Liked · Monthly' },
  { value: 'liked-all', label: 'Most Liked · All Time' },
  { value: 'price-asc', label: 'Price · Low to High' },
  { value: 'price-desc', label: 'Price · High to Low' },
];

const typeOptions: AppSelectOption<string>[] = [
  { value: 'all', label: 'All Post Types' },
  ...RIFTBOUND_POST_TYPES.map((type) => ({ value: type, label: type === 'collection' ? 'Collections' : type === 'set' ? 'Sets' : 'Decks' })),
];

const sideboardOptions: AppSelectOption<string>[] = [
  { value: 'all', label: 'Any Sideboard' },
  { value: 'true', label: 'Sideboard Present' },
  { value: 'false', label: 'No Sideboard' },
];

function getSetOptions() {
  const names = new Map(RIFTBOUND_CARDS.map((card) => [card.setCode, card.setName]));
  return [
    { value: 'all', label: 'All Sets' },
    ...Array.from(names.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([value, name]) => ({ value, label: `${value} · ${name}` })),
  ];
}

function resolveCardFilter(value: string) {
  const cleanValue = value.trim().toLowerCase();
  if (!cleanValue) return null;
  const card = RIFTBOUND_CARDS.find((candidate) => candidate.id.toLowerCase() === cleanValue || candidate.displayName.toLowerCase() === cleanValue);
  return card?.id ?? null;
}

function formatSourceLabel(data: RiftboundBootstrapResponse | null, value: string) {
  if (value === 'collection') return 'My Collection';
  const [type, id] = value.split(':');
  if (type === 'set') return data?.sets?.sets?.find((set) => set.id === id)?.name ?? 'Selected Set';
  return data?.decks?.decks?.find((deck) => deck.id === id)?.name ?? 'Selected Deck';
}

export function RiftboundCommunity() {
  const [session, setSession] = useState<Session | null>(null);
  const [posts, setPosts] = useState<RiftboundCommunityPostSummary[]>([]);
  const [sort, setSort] = useState<RiftboundCommunityPostSort>('recent');
  const [postType, setPostType] = useState('all');
  const [setCode, setSetCode] = useState('all');
  const [sideboard, setSideboard] = useState('all');
  const [legendFilter, setLegendFilter] = useState('');
  const [championFilter, setChampionFilter] = useState('');
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
  const [sourceType, setSourceType] = useState('collection');
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postVisibility, setPostVisibility] = useState('public');
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState('');
  const requestIdRef = useRef(0);
  const nextCursorRef = useRef<string | null>(null);
  const setOptions = useMemo(() => getSetOptions(), []);

  useEffect(() => subscribeToAuthSession((nextSession) => setSession(nextSession)), []);

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams({ sort, limit: '20' });
    if (postType !== 'all') params.set('type', postType);
    if (setCode !== 'all') params.set('set', setCode);
    if (sideboard !== 'all') params.set('sideboard', sideboard);
    const filters: Array<[string, string]> = [
      ['legend', legendFilter],
      ['champion', championFilter],
      ['battlefield', battlefieldFilter],
      ['unit', unitFilter],
    ];
    filters.forEach(([key, value]) => {
      const cardId = resolveCardFilter(value);
      if (cardId) params.set(key, cardId);
    });
    return `/api/riftbound/community/feed?${params.toString()}`;
  }, [battlefieldFilter, championFilter, legendFilter, postType, setCode, sideboard, sort, unitFilter]);

  const loadFeed = useCallback(async (append = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const cursor = nextCursorRef.current;
      const url = append && cursor ? `${feedUrl}&cursor=${encodeURIComponent(cursor)}` : feedUrl;
      const data = await getRiftboundCommunityFeed(url, session);
      if (requestId !== requestIdRef.current) return;
      setPosts((current) => append ? [...current, ...data.posts] : data.posts);
      nextCursorRef.current = data.nextCursor;
      setNextCursor(data.nextCursor);
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
    nextCursorRef.current = null;
    setNextCursor(null);
    void loadFeed(false);
  }, [feedUrl, loadFeed]);

  const loadSourceData = async () => {
    if (!session || sourceData || sourceLoading) return;
    setSourceLoading(true);
    try {
      setSourceData(await getRiftboundBootstrap(session));
    } catch (loadError) {
      setPostError(loadError instanceof Error ? loadError.message : 'Unable to load your Riftbound sources.');
    } finally {
      setSourceLoading(false);
    }
  };

  const openCreatePost = () => {
    setCreateOpen(true);
    setPostError('');
    void loadSourceData();
  };

  const publishPost = async () => {
    if (!session || postSaving) return;
    const [selectedType, selectedId] = sourceType.split(':');
    setPostSaving(true);
    setPostError('');
    try {
      const data = await createRiftboundCommunityPost({
        sourceType: selectedType,
        sourceId: selectedId || null,
        title: postTitle,
        body: postBody,
        visibility: postVisibility,
      }, session);
      setPosts((current) => [data.post, ...current]);
      setCreateOpen(false);
      setPostTitle('');
      setPostBody('');
      setPostVisibility('public');
    } catch (saveError) {
      setPostError(saveError instanceof Error ? saveError.message : 'Unable to publish this post.');
    } finally {
      setPostSaving(false);
    }
  };

  const updatePost = (nextPost: RiftboundCommunityPostSummary) => {
    setPosts((current) => current.map((post) => post.id === nextPost.id ? nextPost : post));
  };

  const activeFilterCount = [postType !== 'all', setCode !== 'all', sideboard !== 'all', legendFilter.trim(), championFilter.trim(), battlefieldFilter.trim(), unitFilter.trim()].filter(Boolean).length;
  const sourceOptions: AppSelectOption<string>[] = [
    { value: 'collection', label: 'My Collection' },
    ...(sourceData?.sets?.sets ?? []).map((set) => ({ value: `set:${set.id}`, label: `Set · ${set.name}` })),
    ...(sourceData?.decks?.decks ?? []).map((deck) => ({ value: `deck:${deck.id}`, label: `Deck · ${deck.name}` })),
  ];

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10" aria-label="Riftbound community">
      <section className="mx-auto grid w-full max-w-[1200px] gap-6">
        <header className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"><Home size={14} /> Home</Link>
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Riftbound Community</span>
              </div>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Discover Riftbound</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Browse shared collections, sets, and game decks from the KnowLeague community.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/inventory" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white">Inventory</Link>
              <Link href="/riftbound/profile" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-white/25 hover:text-white">Riftbound Profile</Link>
              {session ? <button type="button" onClick={openCreatePost} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200"><Plus size={15} /> Create Post</button> : null}
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3 lg:grid-cols-[minmax(0,1fr)_16rem_11rem]">
            <div className="flex min-w-0 flex-wrap gap-2">
              <AppSelectMenu label="Sort" value={sort} options={sortOptions} onChange={setSort} triggerClassName="min-h-12" />
              <AppSelectMenu label="Post Type" value={postType} options={typeOptions} onChange={setPostType} triggerClassName="min-h-12" />
            </div>
            <AppSelectMenu label="Set" value={setCode} options={setOptions} onChange={setSetCode} triggerClassName="min-h-12" />
            <button type="button" onClick={() => setFiltersOpen((current) => !current)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200">
              <Search size={16} /> Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </button>
          </div>
          {filtersOpen ? (
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4 md:grid-cols-2">
              <AppSelectMenu label="Sideboard" value={sideboard} options={sideboardOptions} onChange={setSideboard} />
              {[
                ['Legend', legendFilter, setLegendFilter],
                ['Champion Unit', championFilter, setChampionFilter],
                ['Battlefield', battlefieldFilter, setBattlefieldFilter],
                ['Unit', unitFilter, setUnitFilter],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label as string}</span>
                  <input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder="Exact card name or id" className="h-12 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" />
                </label>
              ))}
            </div>
          ) : null}
        </header>

        {createOpen ? (
          <section className="grid gap-4 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">New community post</p><h2 className="mt-2 text-2xl font-black text-white">Share a Riftbound source</h2></div>
              <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close create post" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-300 transition hover:bg-slate-800"><X size={17} /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <AppSelectMenu label="Source" value={sourceType} options={sourceOptions} onChange={(value) => { setSourceType(value); setPostTitle(value === 'collection' ? 'My Riftbound Collection' : formatSourceLabel(sourceData, value)); }} />
              <AppSelectMenu label="Visibility" value={postVisibility} options={[{ value: 'public', label: 'Public · Discoverable' }, { value: 'unlisted', label: 'Unlisted · Link only' }]} onChange={setPostVisibility} />
            </div>
            {sourceLoading ? <p className="text-sm text-slate-500">Loading your collections, sets, and decks...</p> : null}
            <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Post title</span><input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} maxLength={80} placeholder="Post title" className="h-12 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /></label>
            <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Description</span><textarea value={postBody} onChange={(event) => setPostBody(event.target.value)} maxLength={1000} rows={4} placeholder="Tell the community about this collection or deck" className="resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /></label>
            {postError ? <p className="rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm font-semibold text-red-200">{postError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-white/25 hover:text-white">Cancel</button><button type="button" onClick={() => void publishPost()} disabled={postSaving || sourceLoading} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">{postSaving ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Publish Post</button></div>
          </section>
        ) : null}

        {loading ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading the community feed...</section> : error ? <section className="grid gap-3 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error}</p><button type="button" onClick={() => void loadFeed(false)} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-red-200/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em]"><RefreshCw size={14} /> Try Again</button></section> : posts.length === 0 ? <section className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">No community posts match these filters yet.</section> : <div className="grid gap-4">{posts.map((post) => <RiftboundCommunityPostCard key={post.id} post={post} session={session} onPostChange={updatePost} />)}</div>}

        {!loading && nextCursor ? <button type="button" onClick={() => void loadFeed(true)} disabled={loadingMore} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-black text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60">{loadingMore ? <LoaderCircle size={16} className="animate-spin" /> : null} Load More</button> : null}
      </section>
    </main>
  );
}
