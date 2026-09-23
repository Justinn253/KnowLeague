'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AugmentCard } from '@/components/augment-card';
import { GameIconImage } from '@/components/game-asset-image';
import { AugmentExtraDetails } from '@/components/augment-extra-details';
import { AugmentDescriptionEditor } from '@/components/augment-description-editor';
import {
  AugmentExport,
  AugmentHeader,
  augmentButton,
  augmentInput,
  augmentRequest,
  cacheAugmentView,
  getCachedAugmentView,
  invalidateAugmentBinder,
  invalidateAugmentView,
  useAugmentSession,
} from '@/components/augment-shared';
import { rememberAuthReturnPath } from '@/lib/auth-redirect';
import { HeaderHoverNote } from '@/components/header-hover-note';
import {
  AUGMENT_ICONS,
  AUGMENT_LIMITS,
  AUGMENT_RARITIES,
  isAugmentIconForRarity,
  emptyAugment,
  parseAugmentDraft,
  resolveAugmentIconId,
  type AugmentDraft,
  type PublishedAugment,
} from '@/lib/augment-builder';

const STORAGE_KEY = 'knowleague:augment-builder:draft:v1';
const TABS = ['Rarity', 'Icon', 'Name', 'Description'] as const;
export function AugmentBuilder({ editId = null, templateId = null, fresh = false }: { editId?: string | null; templateId?: string | null; fresh?: boolean }) {
  const router = useRouter();
  const editing = Boolean(editId);
  const { session, resolved } = useAugmentSession();
  const [draft, setDraft] = useState<AugmentDraft | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Rarity');
  const [query, setQuery] = useState('');
  const [iconPage, setIconPage] = useState(0);
  const [storageStatus, setStorageStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(session?.user.id);
  const freshAppliedRef = useRef(false);
  sessionId.current = session?.user.id;
  useEffect(() => {
    if (!resolved) return;
    const controller = new AbortController();
    if (editId || templateId) {
      if (editId && !session) {
        setDraft(null);
        setError(editing ? 'Sign in to edit your own augment.' : 'Sign in to publish an augment.');
        return () => controller.abort();
      }
      setDraft(null);
      setError('');
      const sourceId = editId ?? templateId;
      const viewer = session?.user.id ?? null;
      const cached = sourceId ? getCachedAugmentView(sourceId, viewer) : null;
      const sourcePromise = cached
        ? Promise.resolve({ augment: cached })
        : augmentRequest<{ augment: PublishedAugment }>('/api/augments/' + sourceId, session, { signal: controller.signal });
      void sourcePromise
        .then((result) => {
          if (controller.signal.aborted) return;
          if (editId && result.augment.author?.id !== session?.user.id) {
            setError('You can only edit augments created by your account.');
            return;
          }
          cacheAugmentView(result.augment, viewer);
          setDraft(
            editId
              ? result.augment
              : parseAugmentDraft({ ...result.augment, id: crypto.randomUUID() }) ?? emptyAugment(crypto.randomUUID()),
          );
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load this augment.');
        });
      return () => controller.abort();
    }
    if (fresh && !freshAppliedRef.current) {
      freshAppliedRef.current = true;
      const blank = emptyAugment(crypto.randomUUID());
      setDraft(blank);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blank));
        setStorageStatus('');
      } catch {
        setStorageStatus('Browser storage is unavailable. Your new draft is not saved.');
      }
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('fresh');
      window.history.replaceState(
        window.history.state,
        '',
        currentUrl.pathname + (currentUrl.search ? ('?' + currentUrl.searchParams.toString()) : '') + currentUrl.hash,
      );
      return () => controller.abort();
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? parseAugmentDraft(JSON.parse(stored)) : null;
      setDraft(parsed ?? emptyAugment(crypto.randomUUID()));
    } catch {
      setDraft(emptyAugment(crypto.randomUUID()));
      setStorageStatus('Browser storage is unavailable. Keep this page open to retain your draft.');
    }
    return () => controller.abort();
  }, [editId, editing, fresh, resolved, session, templateId]);
  const icons = useMemo(
    () =>
      AUGMENT_ICONS.filter(
        (icon) =>
          icon.rarity === draft?.rarity &&
          icon.searchTerms
            .join(' ')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .includes(query.toLowerCase().replace(/[^a-z0-9]/g, '')),
      ).sort((a, b) => a.visualOrder - b.visualOrder),
    [query, draft?.rarity],
  );
  function resetDraft() {
    const fresh = emptyAugment(crypto.randomUUID());
    setDraft(fresh);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      setStorageStatus('');
    } catch {
      setStorageStatus('Browser storage is unavailable. Your new draft is not saved.');
    }
  }
  function update(patch: Partial<AugmentDraft>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageStatus('');
    } catch {
      setStorageStatus('Browser storage is unavailable. Your latest edits are not saved.');
    }
  }
  async function finish() {
    if (!session) {
      setError(editing ? 'Sign in to edit your own augment.' : 'Sign in to publish an augment.');
      return;
    }
    if (!draft || !parseAugmentDraft(draft, true)) {
      setError(
        'Choose an icon matching the rarity, add a name, and write a short description of at most 200 characters and 12 lines before finishing.',
      );
      return;
    }
    setSaving(true);
    setError('');
    const owner = session?.user.id;
    try {
      const result = await augmentRequest<{ augment: PublishedAugment }>(
        editing ? `/api/augments/${draft.id}` : '/api/augments',
        session,
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify(draft),
        },
      );
      if (owner !== sessionId.current) return;
      if (editing) {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // A successful edit should still navigate if browser storage is unavailable.
        }
      } else resetDraft();
      if (owner) invalidateAugmentBinder(owner);
      invalidateAugmentView(result.augment.id);
      cacheAugmentView(result.augment, owner ?? null);
      if (editing) router.push('/augment-builder/augment/' + result.augment.id);
      else router.replace('/augment-builder/augment/' + result.augment.id + '?published=1');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to publish augment. Your draft is still saved locally.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <AugmentHeader title={editing ? 'Edit Augment' : 'Augment Builder'} binder={session?.user.id} back="/augment-builder" backLabel="To Community" />
      {!draft ? (
        error ? (
          <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-red-200">
            {error}
          </p>
        ) : (
          <div role="status" className="grid min-h-[42rem] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-h-[30rem] animate-pulse rounded-2xl border border-white/10 bg-slate-900/40" />
            <div className="min-h-[34rem] animate-pulse rounded-2xl border border-white/10 bg-slate-950/60" />
            <span className="sr-only">Loading your draft...</span>
          </div>
        )
      ) : (
        <>
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                <div
                  ref={tabsRef}
                  role="tablist"
                  aria-label="Augment card editor"
                  className="grid grid-cols-4 border-b border-white/10"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const index =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? 3
                          : (TABS.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
                    setTab(TABS[index]);
                    (tabsRef.current?.children[index] as HTMLButtonElement)?.focus();
                  }}
                >
                  {TABS.map((name, index) => (
                    <button
                      key={name}
                      role="tab"
                      id={`augment-tab-${name}`}
                      aria-controls={`augment-panel-${name}`}
                      aria-selected={tab === name}
                      tabIndex={tab === name ? 0 : -1}
                      onClick={() => setTab(name)}
                      className={`min-h-16 border-b-2 px-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-200 ${tab === name ? 'border-amber-200 bg-amber-200/5 text-amber-100' : 'border-transparent text-slate-400 hover:text-white'}`}
                    >
                      <span className="mr-2 hidden text-xs opacity-50 sm:inline">0{index + 1}</span>
                      {name}
                    </button>
                  ))}
                </div>
                <fieldset
                  disabled={saving}
                  role="tabpanel"
                  id={`augment-panel-${tab}`}
                  aria-labelledby={`augment-tab-${tab}`}
                  className="min-h-[320px] min-w-0 p-4 sm:p-6"
                >
                  {tab === 'Rarity' ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        {AUGMENT_RARITIES.map((rarity) => (
                          <button
                            key={rarity}
                            aria-pressed={draft.rarity === rarity}
                            className={`rounded-xl border p-2 transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${draft.rarity === rarity ? 'border-amber-200 bg-amber-200/5' : 'border-white/10 hover:border-white/30'}`}
                            onClick={() => {
                              setIconPage(0);
                              update({ rarity, icon: isAugmentIconForRarity(draft.icon, rarity) ? draft.icon : '' });
                            }}
                          >
                            <AugmentCard draft={{ ...emptyAugment(draft.id), rarity }} blank />
                            <span className="mt-3 flex items-center justify-center gap-1 text-xs font-bold capitalize text-slate-100 sm:text-sm">
                              {draft.rarity === rarity ? <Check size={13} /> : null}
                              {rarity}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {tab === 'Icon' ? (
                    <>
                      <label className="relative block">
                        <Search size={17} className="absolute left-3 top-4 text-slate-500" />
                        <input
                          aria-label="Search augment icons"
                          className={`${augmentInput} pl-10`}
                          placeholder="Search icons..."
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setIconPage(0);
                          }}
                        />
                      </label>
                      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {icons.slice(iconPage * 36, (iconPage + 1) * 36).map((icon) => (
                          <button
                            key={icon.id}
                            title={icon.name}
                            aria-label={icon.name}
                            aria-pressed={resolveAugmentIconId(draft.icon) === icon.id}
                            onClick={() => update({ icon: icon.id })}
                            className={`flex flex-col items-center rounded-xl border p-2 focus:outline-none focus:ring-2 focus:ring-amber-200 ${resolveAugmentIconId(draft.icon) === icon.id ? 'border-amber-200 bg-amber-200/10' : 'border-white/10 bg-slate-950 hover:border-white/30'}`}
                          >
                            <GameIconImage src={`/augments/icons/${icon.id}.png`} width={64} height={64} alt="" />
                            <span className="mt-1 line-clamp-2 break-all text-[10px] text-slate-400">{icon.name}</span>
                          </button>
                        ))}
                      </div>
                      {!icons.length ? (
                        <p className="mt-6 text-slate-400">No icons match this search.</p>
                      ) : (
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <button
                            className={augmentButton}
                            disabled={iconPage === 0}
                            onClick={() => setIconPage(iconPage - 1)}
                          >
                            Previous
                          </button>
                          <span className="text-xs text-slate-400">
                            {iconPage + 1} / {Math.ceil(icons.length / 36)}
                          </span>
                          <button
                            className={augmentButton}
                            disabled={(iconPage + 1) * 36 >= icons.length}
                            onClick={() => setIconPage(iconPage + 1)}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  ) : null}
                  {tab === 'Name' ? (
                    <>
                      <label htmlFor="augment-name" className="mb-2 block text-sm font-bold text-slate-200">
                        Augment name
                      </label>
                      <input
                        id="augment-name"
                        className={augmentInput}
                        value={draft.name}
                        maxLength={AUGMENT_LIMITS.name}
                        onChange={(event) => update({ name: event.target.value })}
                        placeholder="Name your augment"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {draft.name.length}/{AUGMENT_LIMITS.name}
                      </p>
                    </>
                  ) : null}
                  {tab === 'Description' ? (
                    <AugmentDescriptionEditor
                      value={draft.description}
                      onChange={(description) => update({ description })}
                    />
                  ) : null}
                </fieldset>
              </section>
              <AugmentExtraDetails draft={draft} disabled={saving} onChange={update} />
              {storageStatus ? (
                <p role="alert" className="text-xs text-red-200">
                  {storageStatus}
                </p>
              ) : null}
            </div>
            <aside className="space-y-5 rounded-2xl border border-white/10 bg-slate-950/60 p-5 lg:sticky lg:top-6">
              <AugmentCard draft={draft} />
              <span className="group relative block">
              <button
                className={`${augmentButton} w-full !border-amber-200/70 !bg-amber-300 !text-slate-950`}
                disabled={saving || !resolved || !session}
                onClick={() => void finish()}
              >
                <Check size={17} />
                {saving ? (editing ? 'Saving\u2026' : 'Publishing\u2026') : editing ? 'Save Changes' : 'Publish Augment'}
              </button>
                {!session ? <HeaderHoverNote wide>Only KnowLeague account holders can publish augments.</HeaderHoverNote> : null}
              </span>
              <div className="space-y-2">
                {!session ? (
                  <span className="group relative inline-flex self-start">
                    <Link
                      href="/login"
                      onClick={() => rememberAuthReturnPath(window.location.pathname, window.location.search)}
                      className="text-xs text-amber-200 underline decoration-dotted underline-offset-2"
                    >
                      Sign in to publish
                    </Link>
                  </span>
                ) : null}
                <div className="w-full">
                  <AugmentExport draft={draft} compact />
                </div>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </aside>
          </div>
          <p className="mt-8 text-center text-xs text-slate-600">
            Fan-made augments. Artwork by Riot Games, sourced through CommunityDragon.
          </p>
        </>
      )}
    </main>
  );
}





