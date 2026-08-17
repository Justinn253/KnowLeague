'use client';

import Link from 'next/link';
import { Check, GripVertical, LoaderCircle, Minus, PackageOpen, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getRiftboundDeckPreviewCards } from '@/components/riftbound-deck-preview';
import {
  compareRiftboundCards,
  createRiftboundCardFilters,
  filterOptions,
  getRiftboundCardFilterCount,
  getRiftboundCardSearchText,
  jumbledValues,
  matchesFilter,
  matchesRiftboundPriceRange,
  normalizeRiftboundSearchText,
  RIFTBOUND_RARITY_ORDER,
  RiftboundCardDetailsModal,
  RiftboundCardRow,
  RIFTBOUND_SORT_OPTIONS,
  toggleFilterValue,
  type RiftboundCategoricalFilterField,
  type RiftboundCardFilters,
  type RiftboundSortMode,
} from '@/components/riftbound-card-grid';
import { RiftboundCommunityPostCard } from '@/components/riftbound-community-post-card';
import { RiftboundMasterSet } from '@/components/riftbound-master-set';
import { RiftboundMasterSetComparison } from '@/components/riftbound-master-set-comparison';
import { navigateToPublicProfile } from '@/lib/profile-navigation';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, getRiftboundCardRarityTextClass, getRiftboundCardTierGroupId, getRiftboundRarityTextClass, mergeRiftboundCardMarketPrices, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundBootstrap } from '@/lib/riftbound-client';
import { getRiftboundOwnerProfile, getRiftboundPublicProfile, updateRiftboundProfilePreference } from '@/lib/riftbound-community-client';
import { createRiftboundShareUrl } from '@/lib/riftbound-share-client';
import { buildRiftboundDeckShareSnapshot } from '@/lib/riftbound-share-types';
import { buildRiftboundMasterSetInventoryMap, isRiftboundMasterSetCatalogueCard } from '@/lib/riftbound-master-set';
import type { RiftboundCardTierRating, RiftboundProfileData, RiftboundWishlistCard } from '@/lib/riftbound-community-types';

type ProfileSection = 'overview' | 'collection' | 'master-set' | 'decks' | 'posts';

const profileSections: ProfileSection[] = ['overview', 'collection', 'master-set', 'decks', 'posts'];

function openRiftboundDeckShare(source: RiftboundProfileData['decks'][number], creatorName: string, session: Session | null) {
  const popup = window.open('about:blank', '_blank', 'noopener,noreferrer');
  void createRiftboundShareUrl(buildRiftboundDeckShareSnapshot(source, {
    createdBy: creatorName,
    createdAt: source.updated_at || source.created_at,
  }), session)
    .then((url) => {
      if (popup) popup.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    })
    .catch(() => popup?.close());
}

function parseProfileSection(value: string | null) {
  if (value === 'sources') return 'decks';
  return profileSections.includes(value as ProfileSection) ? value as ProfileSection : 'overview';
}

type ProfileCollectionCard = {
  card: RiftboundCard;
  normalQuantity: number;
  foilQuantity: number;
  totalQuantity: number;
};

const profileSortOptions: AppSelectOption<RiftboundSortMode>[] = RIFTBOUND_SORT_OPTIONS;

function formatValue(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(cents / 100);
}

function getEstimatedCollectionValueCents(items: RiftboundProfileData['collection']['items'], cardsById: ReadonlyMap<string, RiftboundCard>) {
  return items.reduce((total, item) => {
    const card = cardsById.get(item.card_id);
    const price = card?.marketPrices?.[item.finish] ?? card?.marketPrice ?? 0;
    return total + Math.round(price * item.quantity * 100);
  }, 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function ProfileStat({ label, value, onClick, title }: { label: string; value: string | number; onClick?: () => void; title?: string }) {
  const content = <><p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></>;
  if (!onClick) return <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3">{content}</div>;
  return <button type="button" onClick={onClick} title={title} className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3 text-left transition hover:border-amber-200/50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200">{content}</button>;
}

function getProfileCollectionFilterOptions() {
  const setNames = new Map(RIFTBOUND_CARDS.map((card) => [card.setCode, card.setName]));
  return {
    setCode: filterOptions(
      jumbledValues(Array.from(new Set(RIFTBOUND_CARDS.map((card) => card.setCode))).sort()),
      'All Sets',
      (setCode) => `${setCode} - ${setNames.get(setCode) ?? setCode}`,
    ),
    rarity: filterOptions(RIFTBOUND_RARITY_ORDER.filter((rarity) => RIFTBOUND_CARDS.some((card) => card.rarity === rarity)), 'All Rarities'),
    cardType: filterOptions(jumbledValues(Array.from(new Set(RIFTBOUND_CARDS.map((card) => card.cardType))).sort()), 'All Card Types'),
    domain: filterOptions(
      ['Colorless', 'Body', 'Mind', 'Order', 'Chaos', 'Calm', 'Fury'].filter((domain) => RIFTBOUND_CARDS.some((card) => card.domains.includes(domain))),
      'All Domains',
    ),
    energyCost: filterOptions(jumbledValues(Array.from(new Set(RIFTBOUND_CARDS.map((card) => String(card.energyCost)))).sort()), 'All Energy Costs'),
    powerCost: filterOptions(jumbledValues(Array.from(new Set(RIFTBOUND_CARDS.map((card) => String(card.powerCost)))).sort()), 'All Power Costs'),
    might: filterOptions(jumbledValues(Array.from(new Set(RIFTBOUND_CARDS.map((card) => String(card.might)))).sort()), 'All Might Values'),
  };
}

function OverviewCardTile({ cardId, onOpen, action, tierRatings }: { cardId: string; onOpen: (card: RiftboundCard) => void; action?: ReactNode; tierRatings?: Record<string, RiftboundCardTierRating> }) {
  const card = getRiftboundCardById(cardId);
  if (!card) return null;
  const tier = tierRatings?.[getRiftboundCardTierGroupId(card)]?.tier;
  return <article className="group relative min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-2 transition focus-within:border-amber-200 hover:border-amber-200/50 hover:bg-slate-800"><button type="button" onClick={() => onOpen(card)} className="block w-full min-w-0 text-center focus:outline-none"><div className="relative mx-auto aspect-[744/1039] w-full max-w-[8rem] overflow-hidden rounded-lg bg-slate-950"><RiftboundCardImage card={card} sizes="128px" className="object-cover" /></div><p className={`mt-2 truncate text-center text-sm font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</p><p className="mt-1 truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}{tier ? ` · ${tier}` : ''}</p></button>{action ? <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">{action}</div> : null}</article>;
}

function ReorderableOverviewCardTile({ cardId, onOpen, action, tierRatings, draggable, dragging, onDragStart, onDragOver, onDrop, onDragEnd }: { cardId: string; onOpen: (card: RiftboundCard) => void; action?: ReactNode; tierRatings?: Record<string, RiftboundCardTierRating>; draggable: boolean; dragging: boolean; onDragStart: (event: DragEvent<HTMLDivElement>) => void; onDragOver: (event: DragEvent<HTMLDivElement>) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onDragEnd: () => void }) {
  return <div draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} title={draggable ? 'Drag to reorder' : undefined} className={`relative min-w-0 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'opacity-60' : ''}`}>
    {draggable ? <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-slate-950/80 p-1 text-slate-400"><GripVertical size={14} /><span className="sr-only">Drag to reorder</span></div> : null}
    <OverviewCardTile cardId={cardId} onOpen={onOpen} action={action} tierRatings={tierRatings} />
  </div>;
}

function OverviewPreferenceButton({ label, onClick, active, pending = false, children }: { label: string; onClick: () => void; active: boolean; pending?: boolean; children: ReactNode }) {
  return <button type="button" onClick={onClick} disabled={pending} aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100 ${active ? 'border-amber-200 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-amber-200/70 bg-slate-700 text-white hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950'}`}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : children}</button>;
}

type ProfileDeckSource = RiftboundProfileData['decks'][number];

type ProfileSourceCardProps =
  | {
    source: ProfileDeckSource;
    favorite: boolean;
    owner: boolean;
    cardsById: ReadonlyMap<string, RiftboundCard>;
    pending?: boolean;
    tierRatings: Record<string, RiftboundCardTierRating>;
    onFavorite: () => void;
    onOpen: () => void;
  };

function ProfileSourceCard(props: ProfileSourceCardProps) {
  const { source, onOpen } = props;
  const previewCards = getRiftboundDeckPreviewCards(source, props.cardsById);
  const favoriteControl = props.owner
      ? <OverviewPreferenceButton label={props.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={props.onFavorite} active={props.favorite} pending={props.pending ?? false}><Star size={15} className={props.favorite ? 'fill-current' : ''} /></OverviewPreferenceButton>
      : props.favorite ? <span title="Favorite source" aria-label="Favorite source" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200/50 bg-amber-300/10 text-amber-200"><Star size={15} className="fill-current" /></span> : null

  return (
    <article className="relative grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition focus-within:border-amber-200/70 hover:border-amber-200/40">
      <button type="button" onClick={onOpen} className="grid min-w-0 gap-3 text-left focus:outline-none">
        <div className="min-w-0 pr-10">
          <h3 className="truncate text-lg font-black text-white" title={source.name}>{source.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400" title={source.description || 'No description'}>{source.description || 'No description'}</p>
        </div>
        {previewCards.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previewCards.map((card) => (
            <div key={card.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-center">
              <div className="relative mx-auto aspect-[744/1039] w-full max-w-[6rem] overflow-hidden rounded-lg bg-slate-900"><RiftboundCardImage card={card} sizes="96px" loading="lazy" className="object-cover" /></div>
              <p className={`mt-1 truncate text-center text-[0.65rem] font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</p>
              <p className="mt-1 truncate text-center text-[0.58rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}{props.tierRatings[getRiftboundCardTierGroupId(card)]?.tier ? ` · ${props.tierRatings[getRiftboundCardTierGroupId(card)]?.tier}` : ''}</p>
            </div>
          ))}
        </div> : null}
      </button>
      {favoriteControl ? <div className="absolute right-4 top-4">{favoriteControl}</div> : null}
    </article>
  );
}

export function RiftboundProfile({ username }: { username?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<RiftboundProfileData | null>(null);
  const [tierRatings, setTierRatings] = useState<Record<string, RiftboundCardTierRating>>({});
  const [section, setSection] = useState<ProfileSection>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [masterSetComparisonOpen, setMasterSetComparisonOpen] = useState(false);
  const [masterSetComparisonInventory, setMasterSetComparisonInventory] = useState<ReadonlyMap<string, number> | null>(null);
  const [masterSetComparisonLoading, setMasterSetComparisonLoading] = useState(false);
  const [masterSetComparisonError, setMasterSetComparisonError] = useState('');
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [profileAbout, setProfileAbout] = useState('');
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const [savingAction, setSavingAction] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [recentlyUnfavoritedCardIds, setRecentlyUnfavoritedCardIds] = useState<string[]>([]);
  const [recentlyRemovedWishlistEntries, setRecentlyRemovedWishlistEntries] = useState<RiftboundWishlistCard[]>([]);
  const [recentlyUnfavoritedDeckIds, setRecentlyUnfavoritedDeckIds] = useState<string[]>([]);
  const [draggedPreference, setDraggedPreference] = useState<{ list: 'favorite' | 'wishlist'; cardId: string } | null>(null);
  const reorderSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReorderRef = useRef<{ list: 'favorite' | 'wishlist'; cardIds: string[]; previousProfile: RiftboundProfileData } | null>(null);
  const reorderRequestInFlightRef = useRef(false);
  const [collectionQuery, setCollectionQuery] = useState('');
  const [collectionSortMode, setCollectionSortMode] = useState<RiftboundSortMode>('market-desc');
  const [collectionFiltersOpen, setCollectionFiltersOpen] = useState(false);
  const [collectionFilters, setCollectionFilters] = useState<RiftboundCardFilters>(() => createRiftboundCardFilters());
  const profileLoadedRef = useRef(false);
  const profileViewerIdRef = useRef<string | null>(null);
  const profileRef = useRef<RiftboundProfileData | null>(null);

  useEffect(() => subscribeToAuthSession((nextSession) => {
    const nextViewerId = nextSession?.user.id ?? null;
    if (profileViewerIdRef.current !== nextViewerId) {
      profileViewerIdRef.current = nextViewerId;
      profileLoadedRef.current = false;
      profileRef.current = null;
      setLoading(true);
    }
    setSession(nextSession);
  }), []);

  useEffect(() => {
    const syncSectionFromUrl = () => setSection(parseProfileSection(new URLSearchParams(window.location.search).get('tab')));
    syncSectionFromUrl();
    window.addEventListener('popstate', syncSectionFromUrl);
    return () => window.removeEventListener('popstate', syncSectionFromUrl);
  }, []);

  const navigateSection = useCallback((nextSection: ProfileSection) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('tab', nextSection);
    window.history.pushState({ ...window.history.state, riftboundProfileTab: nextSection }, '', `${nextUrl.pathname}?${nextUrl.searchParams.toString()}${nextUrl.hash}`);
    setSection(nextSection);
  }, []);

  useEffect(() => () => {
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
    const queuedReorder = pendingReorderRef.current;
    if (!queuedReorder || !session) return;
    pendingReorderRef.current = null;
    void updateRiftboundProfilePreference({ action: queuedReorder.list === 'favorite' ? 'reorder-favorite-cards' : 'reorder-wishlist', cardIds: queuedReorder.cardIds }, session);
  }, [session]);

  useEffect(() => {
    if (!descriptionEditing || !descriptionInputRef.current) return;
    const input = descriptionInputRef.current;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [descriptionEditing]);

  const loadProfile = useCallback(async (showLoading = !profileLoadedRef.current) => {
    if (!username && !session) {
      setProfile(null);
      setLoading(false);
      profileLoadedRef.current = true;
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = username ? await getRiftboundPublicProfile(username, session) : await getRiftboundOwnerProfile(session as Session);
      profileRef.current = data.profile;
      setProfile(data.profile);
      setTierRatings(data.profile.cardTiers ?? {});
      setProfileAbout(data.profile.settings.about);
      profileLoadedRef.current = true;
    } catch (loadError) {
      if (profileRef.current) {
        setError('');
      } else {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load this Riftbound profile.');
      }
      profileLoadedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [session, username]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const cardsById = useMemo(() => new Map(RIFTBOUND_CARDS.map((card) => {
    if (!profile) return [card.id, card] as const;
    return [card.id, mergeRiftboundCardMarketPrices(card, profile.prices?.[card.id])] as const;
  })), [profile]);

  const collectionCardEntries = useMemo<ProfileCollectionCard[]>(() => {
    if (!profile) return [];
    const entries = new Map<string, ProfileCollectionCard>();
    profile.collection.items.forEach((item) => {
      const card = cardsById.get(item.card_id);
      if (!card) return;
      const current = entries.get(card.id) ?? { card, normalQuantity: 0, foilQuantity: 0, totalQuantity: 0 };
      if (item.finish === 'foil') current.foilQuantity += item.quantity;
      else current.normalQuantity += item.quantity;
      current.totalQuantity += item.quantity;
      entries.set(card.id, current);
    });
    return Array.from(entries.values());
  }, [cardsById, profile]);

  const collectionQuantities = useMemo(
    () => new Map(collectionCardEntries.map((entry) => [entry.card.id, entry.totalQuantity])),
    [collectionCardEntries],
  );

  const masterSetCards = useMemo(() => Array.from(cardsById.values()).filter(isRiftboundMasterSetCatalogueCard), [cardsById]);
  const profileMasterSetInventory = useMemo(() => buildRiftboundMasterSetInventoryMap(profile?.collection.items ?? []), [profile]);

  const collectionFilterOptions = useMemo(() => getProfileCollectionFilterOptions(), []);
  const deferredCollectionQuery = useDeferredValue(collectionQuery);
  const collectionFilteredCards = useMemo(() => {
    const normalizedQuery = normalizeRiftboundSearchText(deferredCollectionQuery);

    return collectionCardEntries
      .filter(({ card }) => {
        if (!matchesFilter(collectionFilters.setCode, card.setCode)) return false;
        if (!matchesFilter(collectionFilters.rarity, card.rarity)) return false;
        if (!matchesFilter(collectionFilters.cardType, card.cardType)) return false;
        if (!matchesFilter(collectionFilters.domain, card.domains)) return false;
        if (!matchesFilter(collectionFilters.energyCost, String(card.energyCost))) return false;
        if (!matchesFilter(collectionFilters.powerCost, String(card.powerCost))) return false;
        if (!matchesFilter(collectionFilters.might, String(card.might))) return false;
        if (!matchesRiftboundPriceRange(card, collectionFilters.minPrice, collectionFilters.maxPrice)) return false;
        return !normalizedQuery || getRiftboundCardSearchText(card).includes(normalizedQuery);
      })
      .sort((left, right) => compareRiftboundCards(left.card, right.card, collectionSortMode, collectionQuantities));
  }, [collectionCardEntries, collectionFilters, collectionQuantities, collectionSortMode, deferredCollectionQuery]);

  const collectionActiveFilterCount = getRiftboundCardFilterCount(collectionFilters);

  const collectionRarityCounts = useMemo(() => {
    const counts = new Map(RIFTBOUND_RARITY_ORDER.map((rarity) => [rarity, 0]));
    collectionCardEntries.forEach((entry) => {
      if (counts.has(entry.card.rarity)) counts.set(entry.card.rarity, (counts.get(entry.card.rarity) ?? 0) + entry.totalQuantity);
    });
    return counts;
  }, [collectionCardEntries]);

  const estimatedCollectionValueCents = useMemo(
    () => profile ? getEstimatedCollectionValueCents(profile.collection.items, cardsById) : 0,
    [cardsById, profile],
  );

  const savePreference = async (body: Record<string, unknown>, actionKey: string) => {
    if (!session || !profile?.isOwner || savingAction) return false;
    setSavingAction(actionKey);
    setPreferenceError('');
    try {
      await updateRiftboundProfilePreference(body, session);
      return true;
    } catch (saveError) {
      setPreferenceError(saveError instanceof Error ? saveError.message : 'Unable to save this Riftbound profile preference.');
      return false;
    } finally {
      setSavingAction('');
    }
  };

  const reorderPreference = (list: 'favorite' | 'wishlist', draggedCardId: string, targetCardId: string) => {
    const orderAction = `${list}-order`;
    if (!session || !profile?.isOwner || reorderRequestInFlightRef.current || (savingAction && savingAction !== orderAction) || draggedCardId === targetCardId) return;
    const currentIds = list === 'favorite' ? profile.favoriteCardIds : profile.wishlist.map((entry) => entry.cardId);
    const fromIndex = currentIds.indexOf(draggedCardId);
    const targetIndex = currentIds.indexOf(targetCardId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const nextIds = [...currentIds];
    const [movedCardId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(targetIndex, 0, movedCardId);
    const previousProfile = pendingReorderRef.current?.list === list ? pendingReorderRef.current.previousProfile : profile;
    setDraggedPreference(null);
    setPreferenceError('');
    setProfile((current) => current ? list === 'favorite' ? { ...current, favoriteCardIds: nextIds } : { ...current, wishlist: nextIds.map((cardId) => current.wishlist.find((entry) => entry.cardId === cardId)).filter((entry): entry is RiftboundWishlistCard => Boolean(entry)) } : current);
    pendingReorderRef.current = { list, cardIds: nextIds, previousProfile };
    setSavingAction(orderAction);
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
    reorderSaveTimerRef.current = setTimeout(() => {
      reorderSaveTimerRef.current = null;
      const queuedReorder = pendingReorderRef.current;
      if (!queuedReorder) return;
      pendingReorderRef.current = null;
      reorderRequestInFlightRef.current = true;
      void updateRiftboundProfilePreference({ action: queuedReorder.list === 'favorite' ? 'reorder-favorite-cards' : 'reorder-wishlist', cardIds: queuedReorder.cardIds }, session)
        .catch((saveError) => {
          setProfile(queuedReorder.previousProfile);
          setPreferenceError(saveError instanceof Error ? saveError.message : 'Unable to save the new Riftbound card order.');
        })
        .finally(() => {
          reorderRequestInFlightRef.current = false;
          setSavingAction('');
        });
    }, 350);
  };

  const startPreferenceDrag = (list: 'favorite' | 'wishlist', cardId: string, event: DragEvent<HTMLDivElement>) => {
    const orderAction = `${list}-order`;
    if (!profile?.isOwner || reorderRequestInFlightRef.current || (savingAction && savingAction !== orderAction)) {
      event.preventDefault();
      return;
    }
    const currentIds = list === 'favorite' ? profile.favoriteCardIds : profile.wishlist.map((entry) => entry.cardId);
    if (!currentIds.includes(cardId)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', cardId);
    setDraggedPreference({ list, cardId });
  };

  const allowPreferenceDrop = (list: 'favorite' | 'wishlist', targetCardId: string, event: DragEvent<HTMLDivElement>) => {
    if (draggedPreference?.list !== list || draggedPreference.cardId === targetCardId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const dropPreference = (list: 'favorite' | 'wishlist', targetCardId: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const draggedCardId = draggedPreference?.list === list ? draggedPreference.cardId : event.dataTransfer.getData('text/plain');
    setDraggedPreference(null);
    if (draggedCardId) reorderPreference(list, draggedCardId, targetCardId);
  };

  const toggleFavoriteCard = (cardId: string) => {
    if (!profile) return;
    const enabled = !profile.favoriteCardIds.includes(cardId);
    if (enabled && profile.favoriteCardIds.length >= 4) return;
    const previousProfile = profile;
    const previousRecentlyUnfavorited = recentlyUnfavoritedCardIds;
    const nextFavoriteCardIds = enabled ? [...profile.favoriteCardIds, cardId] : profile.favoriteCardIds.filter((id) => id !== cardId);
    setProfile({ ...profile, favoriteCardIds: nextFavoriteCardIds });
    setRecentlyUnfavoritedCardIds((current) => enabled ? current.filter((id) => id !== cardId) : current.includes(cardId) ? current : [...current, cardId]);
    void savePreference({ action: 'favorite-card', cardId, enabled }, `card:${cardId}`).then((saved) => {
      if (!saved) {
        setProfile(previousProfile);
        setRecentlyUnfavoritedCardIds(previousRecentlyUnfavorited);
      }
    });
  };

  const toggleWishlist = (cardId: string) => {
    if (!profile) return;
    const existing = profile.wishlist.find((entry) => entry.cardId === cardId);
    const enabled = !existing;
    const visibleWishlistCount = profile.wishlist.length + recentlyRemovedWishlistEntries.filter((entry) => !profile.wishlist.some((current) => current.cardId === entry.cardId)).length;
    if (enabled && visibleWishlistCount >= 8) return;
    const previousProfile = profile;
    const previousRecentlyRemoved = recentlyRemovedWishlistEntries;
    const restoredEntry = recentlyRemovedWishlistEntries.find((entry) => entry.cardId === cardId);
    const optimisticEntry = existing ?? restoredEntry ?? { cardId, desiredQuantity: 1, note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setProfile({ ...profile, wishlist: enabled ? [...profile.wishlist, optimisticEntry] : profile.wishlist.filter((entry) => entry.cardId !== cardId) });
    setRecentlyRemovedWishlistEntries((current) => enabled ? current.filter((entry) => entry.cardId !== cardId) : existing ? current.some((entry) => entry.cardId === cardId) ? current : [...current, existing] : current);
    void savePreference({ action: 'wishlist', cardId, enabled, desiredQuantity: 1 }, `wishlist:${cardId}`).then((saved) => {
      if (!saved) {
        setProfile(previousProfile);
        setRecentlyRemovedWishlistEntries(previousRecentlyRemoved);
      }
    });
  };

  const toggleFavoriteSource = (type: 'deck', id: string) => {
    if (!profile) return;
    const favorites = profile.favoriteDeckIds;
    const enabled = !favorites.includes(id);
    if (type === 'deck' && enabled && profile.favoriteDeckIds.length >= 4) return;
    const previousProfile = profile;
    const previousRecentlyUnfavoritedDecks = recentlyUnfavoritedDeckIds;
    const nextFavorites = enabled ? [...favorites, id] : favorites.filter((sourceId) => sourceId !== id);
    setProfile({ ...profile, favoriteDeckIds: nextFavorites });
    setRecentlyUnfavoritedDeckIds((current) => enabled ? current.filter((sourceId) => sourceId !== id) : current.includes(id) ? current : [...current, id]);
    void savePreference({ action: 'favorite-deck', sourceId: id, enabled }, `deck:${id}`).then((saved) => {
      if (!saved) {
        setProfile(previousProfile);
        setRecentlyUnfavoritedDeckIds(previousRecentlyUnfavoritedDecks);
      }
    });
  };

  const saveDescription = () => {
    if (!profile) return;
    const previousProfile = profile;
    setProfile({ ...profile, settings: { ...profile.settings, about: profileAbout } });
    void savePreference({ action: 'settings', visibility: profile.settings.visibility, about: profileAbout }, 'description').then((saved) => {
      if (saved) {
        setDescriptionEditing(false);
      } else {
        setProfile(previousProfile);
      }
    });
  };

  const startDescriptionEdit = () => {
    if (!profile) return;
    setProfileAbout(profile.settings.about);
    setPreferenceError('');
    setDescriptionEditing(true);
  };

  const resetCollectionFilters = () => {
    setCollectionQuery('');
    setCollectionSortMode('market-desc');
    setCollectionFilters(createRiftboundCardFilters());
  };

  const toggleCollectionFilter = (field: RiftboundCategoricalFilterField, value: string) => {
    setCollectionFilters((current) => ({ ...current, [field]: toggleFilterValue(current[field], value) }));
  };

  const openProfileCard = useCallback((card: RiftboundCard) => {
    setSelectedCard(cardsById.get(card.id) ?? card);
  }, [cardsById]);

  const compareProfileMasterSetWithMine = async () => {
    if (!session || !profile) {
      setMasterSetComparisonError('Sign in to compare this Master Set with your own.');
      return;
    }
    if (masterSetComparisonInventory) {
      setMasterSetComparisonOpen(true);
      return;
    }
    setMasterSetComparisonLoading(true);
    setMasterSetComparisonError('');
    try {
      const response = await getRiftboundBootstrap(session);
      setMasterSetComparisonInventory(buildRiftboundMasterSetInventoryMap(response.inventory?.items ?? []));
      setMasterSetComparisonOpen(true);
    } catch (comparisonError) {
      setMasterSetComparisonError(comparisonError instanceof Error ? comparisonError.message : 'Unable to load your Master Set for comparison.');
    } finally {
      setMasterSetComparisonLoading(false);
    }
  };

  const openKnowLeagueProfile = () => {
    if (profile) {
      navigateToPublicProfile(profile.profile.username, (href) => router.push(href));
    }
  };

  if (loading) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto max-w-[1200px] rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading Riftbound profile...</div></main>;
  if (error || !profile) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto grid max-w-[1200px] gap-4 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error || 'Sign in to view your Riftbound profile.'}</p><Link href="/login" className="mx-auto rounded-xl border border-red-200/30 px-4 py-2 text-xs font-black uppercase tracking-[0.1em]">Sign In</Link></div></main>;

  const favoriteCards = Array.from(new Set([...profile.favoriteCardIds, ...recentlyUnfavoritedCardIds])).filter((cardId) => getRiftboundCardById(cardId)).slice(0, 4);
  const visibleWishlist = [...profile.wishlist, ...recentlyRemovedWishlistEntries.filter((entry) => !profile.wishlist.some((current) => current.cardId === entry.cardId))].filter((entry) => getRiftboundCardById(entry.cardId)).slice(0, 8);
  const favoriteDecks = profile.decks.filter((deck) => profile.favoriteDeckIds.includes(deck.id) || recentlyUnfavoritedDeckIds.includes(deck.id)).slice(0, 4);

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6">
        <header className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
            <div className="flex min-w-0 items-start gap-4 lg:flex-[2_1_0%]">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-amber-200/30 bg-slate-900 text-4xl font-black text-amber-200 sm:h-32 sm:w-32" style={profile.profile.avatarUrl ? { backgroundImage: `url(${profile.profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{profile.profile.avatarUrl ? null : profile.profile.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0"><h1 className="min-w-0 truncate text-3xl font-black text-white sm:text-4xl" style={getChatNameStyle(profile.profile.chatColor)}><button type="button" onClick={openKnowLeagueProfile} className="truncate text-left transition hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200">{profile.profile.displayName || profile.profile.username}</button></h1><p className="mt-1 text-sm font-semibold text-slate-500">Joined {formatDate(profile.profile.createdAt)}</p><p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Posts {profile.postCount} <span aria-hidden="true">·</span> Favor {profile.postFavor}</p></div>
            </div>
            <div className="flex min-w-0 items-start gap-2 lg:flex-[3_1_0%] lg:border-l lg:border-white/10 lg:pl-6">
            {descriptionEditing && profile.isOwner ? <div className="grid min-w-0 flex-1 gap-2"><textarea ref={descriptionInputRef} autoFocus value={profileAbout} onChange={(event) => setProfileAbout(event.target.value)} maxLength={500} rows={3} placeholder="Add a Riftbound profile description" className="resize-y rounded-xl border border-amber-200/30 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-amber-300" /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-600">{profileAbout.length}/500</span><div className="flex gap-2"><button type="button" onClick={() => { setProfileAbout(profile.settings.about); setDescriptionEditing(false); setPreferenceError(''); }} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-400 transition hover:border-white/25 hover:text-white">Cancel</button><button type="button" onClick={saveDescription} disabled={Boolean(savingAction)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-50">{savingAction === 'description' ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Save</button></div></div></div> : <p className={`min-w-0 flex-1 whitespace-pre-line text-sm leading-6 ${profile.settings.about ? 'text-slate-300' : 'italic text-slate-500'}`}>{profile.settings.about || 'No profile description'}</p>}
            {profile.isOwner && !descriptionEditing ? <button type="button" onClick={startDescriptionEdit} aria-label="Edit Riftbound profile description" title="Edit profile description" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200"><Pencil size={14} /></button> : null}
            </div>
          </div>
          {preferenceError && descriptionEditing ? <p className="text-sm font-semibold text-red-200">{preferenceError}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><ProfileStat label="Card Count" value={profile.collection.totalCopies} onClick={() => navigateSection('collection')} title="View collection" /><ProfileStat label="Collection Value" value={`~${formatValue(estimatedCollectionValueCents)}`} onClick={() => navigateSection('collection')} title="View collection" /><ProfileStat label="Decks" value={profile.decks.length} onClick={() => navigateSection('decks')} title="View decks" /></div>
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-900/70 p-1 sm:grid-cols-5">{profileSections.map((tab) => <button key={tab} type="button" onClick={() => navigateSection(tab)} className={`rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${section === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{tab === 'master-set' ? 'Master Set' : tab === 'decks' ? 'Decks' : tab}</button>)}</div>
        </header>

        {section === 'overview' ? <div className="grid gap-6">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favorite Cards</p>{profile.isOwner && favoriteCards.length > 1 ? <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-500">Drag to reorder</span> : null}</div>{favoriteCards.length > 0 ? <div className="grid gap-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{favoriteCards.map((cardId) => { const favorite = profile.favoriteCardIds.includes(cardId); const pending = savingAction === `card:${cardId}`; return <ReorderableOverviewCardTile key={cardId} cardId={cardId} onOpen={openProfileCard} tierRatings={tierRatings} draggable={profile.isOwner && favorite} dragging={draggedPreference?.list === 'favorite' && draggedPreference.cardId === cardId} onDragStart={(event) => startPreferenceDrag('favorite', cardId, event)} onDragOver={(event) => allowPreferenceDrop('favorite', cardId, event)} onDrop={(event) => dropPreference('favorite', cardId, event)} onDragEnd={() => setDraggedPreference(null)} action={profile.isOwner ? <OverviewPreferenceButton label={favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavoriteCard(cardId)} active={favorite} pending={pending}><Star size={14} className={favorite ? 'fill-current' : ''} /></OverviewPreferenceButton> : undefined} />; })}</div>{favoriteCards.length === 4 ? <p className="text-center text-xs font-semibold text-slate-500">Premium users can have up to 8 favorites</p> : null}</div> : <p className="text-sm text-slate-500">No favorite cards selected yet.</p>}</section>
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Wishlist</p>{profile.isOwner && visibleWishlist.length > 1 ? <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-500">Drag to reorder</span> : null}</div>{visibleWishlist.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{visibleWishlist.map((entry) => { const wishlisted = profile.wishlist.some((current) => current.cardId === entry.cardId); const pending = savingAction === `wishlist:${entry.cardId}`; return <ReorderableOverviewCardTile key={entry.cardId} cardId={entry.cardId} onOpen={openProfileCard} tierRatings={tierRatings} draggable={profile.isOwner && wishlisted} dragging={draggedPreference?.list === 'wishlist' && draggedPreference.cardId === entry.cardId} onDragStart={(event) => startPreferenceDrag('wishlist', entry.cardId, event)} onDragOver={(event) => allowPreferenceDrop('wishlist', entry.cardId, event)} onDrop={(event) => dropPreference('wishlist', entry.cardId, event)} onDragEnd={() => setDraggedPreference(null)} action={profile.isOwner ? <OverviewPreferenceButton label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWishlist(entry.cardId)} active={wishlisted} pending={pending}>{wishlisted ? <Minus size={14} /> : <Plus size={14} />}</OverviewPreferenceButton> : undefined} />; })}</div> : <p className="text-sm text-slate-500">No wishlist cards yet.</p>}</section>
          </div>
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favorite Decks</p></div>{favoriteDecks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{favoriteDecks.map((source) => { const favorite = profile.favoriteDeckIds.includes(source.id); return <ProfileSourceCard key={source.id} source={source} cardsById={cardsById} favorite={favorite} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} tierRatings={tierRatings} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => openRiftboundDeckShare(source, profile.profile.displayName || profile.profile.username, session)} />; })}</div> : <p className="text-sm text-slate-500">No favorite decks selected yet.</p>}</section>
        </div> : null}

        {section === 'collection' ? (
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-black text-emerald-300">~{formatValue(estimatedCollectionValueCents)}</span>
                <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Estimated Value</span>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4" aria-label="Collection rarity breakdown">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection breakdown</p>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{profile.collection.totalCopies} total cards</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {RIFTBOUND_RARITY_ORDER.map((rarity) => (
                  <button key={rarity} type="button" onClick={() => toggleCollectionFilter('rarity', rarity)} className={`rounded-2xl border px-3 py-3 text-center transition focus:outline-none focus:ring-2 focus:ring-amber-200 ${collectionFilters.rarity.includes(rarity) ? 'border-amber-200/70 bg-amber-300/10' : 'border-white/10 bg-slate-950/70 hover:border-amber-200/50 hover:bg-slate-800'}`}>
                    <p className={`text-xs font-black uppercase tracking-[0.12em] ${getRiftboundRarityTextClass(rarity)}`}>{rarity}</p>
                    <p className="mt-1 text-xl font-black text-white">{collectionRarityCounts.get(rarity) ?? 0}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)_auto]">
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={collectionQuery}
                    onChange={(event) => setCollectionQuery(event.target.value)}
                    placeholder="Search name, number, text, tag, domain, type, rarity, artist..."
                    aria-label="Search collection cards"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="search"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-11 pr-11 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm"
                  />
                  {collectionQuery ? <button type="button" aria-label="Clear collection search" onClick={() => setCollectionQuery('')} className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200"><X size={16} /></button> : null}
                </div>
                <AppSelectMenu label="Sort" value={collectionSortMode} options={profileSortOptions} onChange={(value) => setCollectionSortMode(value)} className="min-w-0 [&>span]:sr-only" triggerClassName="h-14" />
                <button type="button" aria-label="Open collection filters" aria-expanded={collectionFiltersOpen} title="Open collection filters" onClick={() => setCollectionFiltersOpen((open) => !open)} className={`inline-flex h-14 w-14 items-center justify-center gap-1 rounded-2xl border text-slate-300 transition hover:border-white/25 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-200 ${collectionFiltersOpen || collectionActiveFilterCount > 0 ? 'border-amber-200/50 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900'}`}>
                  <SlidersHorizontal size={18} />
                  {collectionActiveFilterCount > 0 ? <span className="-mr-2 -mt-6 rounded-md bg-slate-950 px-1.5 py-0.5 text-[0.65rem] text-amber-200">{collectionActiveFilterCount}</span> : null}
                </button>
              </div>

              <div className={`transition-[max-height,opacity,transform] duration-100 ease-out ${collectionFiltersOpen ? 'max-h-[1000px] translate-y-0 opacity-100' : 'pointer-events-none max-h-0 -translate-y-2 overflow-hidden opacity-0'}`}>
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:grid-cols-3">
                  <AppSelectMenu label="Set" value={collectionFilters.setCode[0] ?? 'all'} options={collectionFilterOptions.setCode} selectedValues={collectionFilters.setCode} multiple onToggle={(value) => toggleCollectionFilter('setCode', value)} />
                  <AppSelectMenu label="Rarity" value={collectionFilters.rarity[0] ?? 'all'} options={collectionFilterOptions.rarity} selectedValues={collectionFilters.rarity} multiple onToggle={(value) => toggleCollectionFilter('rarity', value)} />
                  <AppSelectMenu label="Card Type" value={collectionFilters.cardType[0] ?? 'all'} options={collectionFilterOptions.cardType} selectedValues={collectionFilters.cardType} multiple onToggle={(value) => toggleCollectionFilter('cardType', value)} />
                  <AppSelectMenu label="Domain" value={collectionFilters.domain[0] ?? 'all'} options={collectionFilterOptions.domain} selectedValues={collectionFilters.domain} multiple onToggle={(value) => toggleCollectionFilter('domain', value)} />
                  <AppSelectMenu label="Energy Cost" value={collectionFilters.energyCost[0] ?? 'all'} options={collectionFilterOptions.energyCost} selectedValues={collectionFilters.energyCost} multiple onToggle={(value) => toggleCollectionFilter('energyCost', value)} />
                  <AppSelectMenu label="Power Cost" value={collectionFilters.powerCost[0] ?? 'all'} options={collectionFilterOptions.powerCost} selectedValues={collectionFilters.powerCost} multiple onToggle={(value) => toggleCollectionFilter('powerCost', value)} />
                  <AppSelectMenu label="Might" value={collectionFilters.might[0] ?? 'all'} options={collectionFilterOptions.might} selectedValues={collectionFilters.might} multiple onToggle={(value) => toggleCollectionFilter('might', value)} />
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Minimum price</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={collectionFilters.minPrice} onChange={(event) => setCollectionFilters((current) => ({ ...current, minPrice: event.target.value }))} placeholder="No minimum" aria-label="Minimum price" className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Maximum price</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={collectionFilters.maxPrice} onChange={(event) => setCollectionFilters((current) => ({ ...current, maxPrice: event.target.value }))} placeholder="No maximum" aria-label="Maximum price" className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/90 px-4 text-base font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 sm:text-sm" />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-500">Showing {collectionFilteredCards.length} of {collectionCardEntries.length} cards</p>
                <button type="button" onClick={resetCollectionFilters} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-300 transition hover:border-white/25 hover:text-white"><RotateCcw size={14} /> Reset filters</button>
              </div>
            </div>

            {collectionFilteredCards.length > 0 ? <div className="riftbound-card-grid">{collectionFilteredCards.map((entry) => <RiftboundCardRow key={entry.card.id} card={entry.card} normalQuantity={entry.normalQuantity} foilQuantity={entry.foilQuantity} mode="collection-view" pendingChange={false} pending={false} onOpen={openProfileCard} tierVote={tierRatings[getRiftboundCardTierGroupId(entry.card)]?.tier} />)}</div> : <div className="grid justify-items-center gap-3 py-12 text-center text-sm text-slate-500"><PackageOpen size={32} className="text-amber-200" />{collectionCardEntries.length > 0 ? 'No collection cards match these filters.' : 'No public collection cards yet.'}</div>}
          </section>
        ) : null}

        {section === 'master-set' ? (
          <div className="grid gap-3">
            {masterSetComparisonError ? <p role="alert" className="text-sm font-semibold text-red-200">{masterSetComparisonError}</p> : null}
            <RiftboundMasterSet
              cards={masterSetCards}
              inventoryByCard={profileMasterSetInventory}
              selectedCardId={selectedCard?.id}
              onOpen={openProfileCard}
              onCompare={!profile.isOwner && session ? () => void compareProfileMasterSetWithMine() : undefined}
              compareLabel={masterSetComparisonLoading ? 'Loading my Master Set...' : 'Compare with my Master Set'}
            />
          </div>
        ) : null}

        {section === 'decks' ? (
          <div className="grid gap-6">
            <section className="order-1 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Game Decks</p></div>
              {profile.decks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{profile.decks.map((source) => <ProfileSourceCard key={source.id} source={source} cardsById={cardsById} favorite={profile.favoriteDeckIds.includes(source.id)} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} tierRatings={tierRatings} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => openRiftboundDeckShare(source, profile.profile.displayName || profile.profile.username, session)} />)}</div> : <p className="text-sm text-slate-500">No decks saved yet.</p>}
            </section>
          </div>
        ) : null}

        {section === 'posts' ? <section className="grid gap-4">{profile.posts.length > 0 ? profile.posts.map((post) => <RiftboundCommunityPostCard key={post.id} post={post} session={session} openHref={`/riftbound/community/${encodeURIComponent(post.id)}?returnTo=${encodeURIComponent(`/riftbound/profile/${encodeURIComponent(profile.profile.username)}?tab=posts`)}`} />) : <div className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm text-slate-500">No Riftbound posts yet.</div>}</section> : null}
         {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={Boolean(savingAction)} showInventoryControls={false} showMarketDetails preferenceSession={session} tierRating={tierRatings[getRiftboundCardTierGroupId(selectedCard)]} onTierChange={(rating) => setTierRatings((current) => { const next = { ...current }; const groupId = getRiftboundCardTierGroupId(selectedCard); if (rating) next[groupId] = rating; else delete next[groupId]; return next; })} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
         {masterSetComparisonOpen && masterSetComparisonInventory && !profile.isOwner ? <RiftboundMasterSetComparison cards={masterSetCards} leftLabel={profile.profile.username} rightLabel="You" leftInventoryByCard={profileMasterSetInventory} rightInventoryByCard={masterSetComparisonInventory} onClose={() => setMasterSetComparisonOpen(false)} /> : null}
      </section>
    </main>
  );
}
