'use client';

import Link from 'next/link';
import { Check, Home, LoaderCircle, Minus, Package, PackageOpen, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Star, Users, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppSelectMenu, type AppSelectOption } from '@/components/app-select-menu';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import {
  compareRiftboundCards,
  createRiftboundCardFilters,
  filterOptions,
  getRiftboundCardFilterCount,
  getCompactDeckShareUrl,
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
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';
import { isRiftboundChampionUnit } from '@/lib/riftbound-decks';
import { getRiftboundOwnerProfile, getRiftboundPublicProfile, updateRiftboundProfilePreference } from '@/lib/riftbound-community-client';
import type { RiftboundProfileData, RiftboundWishlistCard } from '@/lib/riftbound-community-types';

type ProfileSection = 'overview' | 'collection' | 'sources' | 'posts';

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

function getEstimatedCollectionValueCents(items: RiftboundProfileData['collection']['items']) {
  return items.reduce((total, item) => {
    const card = getRiftboundCardById(item.card_id);
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

function CardPreview({ cardId, quantity }: { cardId: string; quantity?: number }) {
  const card = getRiftboundCardById(cardId);
  if (!card) return null;
  return <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-2"><div className="relative aspect-[744/1039] overflow-hidden rounded-lg bg-slate-950"><RiftboundCardImage card={card} sizes="120px" loading="lazy" className="object-cover" /></div><p className="mt-1 truncate text-[0.65rem] font-black text-slate-200" title={card.displayName}>{card.displayName}</p>{quantity ? <p className="mt-1 text-[0.65rem] font-bold text-amber-200">×{quantity}</p> : null}</div>;
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

function OverviewCardTile({ cardId, onOpen, action }: { cardId: string; onOpen: (card: RiftboundCard) => void; action?: ReactNode }) {
  const card = getRiftboundCardById(cardId);
  if (!card) return null;
  return <article className="group relative min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-2 transition hover:border-amber-200/50 hover:bg-slate-800"><button type="button" onClick={() => onOpen(card)} className="block w-full min-w-0 text-center focus:outline-none focus:ring-2 focus:ring-amber-200"><div className="relative mx-auto aspect-[744/1039] w-full max-w-[8rem] overflow-hidden rounded-lg bg-slate-950"><RiftboundCardImage card={card} sizes="128px" className="object-cover" /></div><p className="mt-2 truncate text-center text-sm font-black text-slate-200" title={card.displayName}>{card.displayName}</p><p className="mt-1 truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</p></button>{action ? <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">{action}</div> : null}</article>;
}

function OverviewPreferenceButton({ label, onClick, active, pending = false, children }: { label: string; onClick: () => void; active: boolean; pending?: boolean; children: ReactNode }) {
  return <button type="button" onClick={onClick} disabled={pending} aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100 ${active ? 'border-amber-200 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-amber-200/70 bg-slate-700 text-white hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950'}`}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : children}</button>;
}

type ProfileDeckSource = RiftboundProfileData['decks'][number];
type ProfileSetSource = RiftboundProfileData['sets'][number];

function getProfileCardMarketValue(card: RiftboundCard) {
  return card.marketPrices?.[card.defaultFinish] ?? card.marketPrice ?? 0;
}

function getDeckPreviewCards(source: ProfileDeckSource) {
  const previewCardIds: string[] = [];
  const addCard = (cardId: string) => {
    if (previewCardIds.length >= 4 || previewCardIds.includes(cardId)) return;
    if (getRiftboundCardById(cardId)) previewCardIds.push(cardId);
  };

  addCard(source.legend_card_id);
  source.cards
    .filter((entry) => entry.category === 'main')
    .forEach((entry) => {
      const card = getRiftboundCardById(entry.card_id);
      if (card && isRiftboundChampionUnit(card)) addCard(card.id);
    });
  source.cards
    .filter((entry) => entry.category === 'battlefields')
    .forEach((entry) => addCard(entry.card_id));

  return previewCardIds.flatMap((cardId) => {
    const card = getRiftboundCardById(cardId);
    return card ? [card] : [];
  });
}

function getSetPreviewCards(source: ProfileSetSource) {
  return source.cards
    .flatMap((entry) => {
      const card = getRiftboundCardById(entry.card_id);
      return card ? [{ card, value: getProfileCardMarketValue(card) * entry.quantity }] : [];
    })
    .sort((left, right) => right.value - left.value || left.card.displayName.localeCompare(right.card.displayName))
    .slice(0, 4)
    .map(({ card }) => card);
}

type ProfileSourceCardProps =
  | {
    sourceType: 'deck';
    source: ProfileDeckSource;
    favorite: boolean;
    owner: boolean;
    pending?: boolean;
    onFavorite: () => void;
    onOpen: () => void;
  }
  | {
    sourceType: 'set';
    source: ProfileSetSource;
    favorite: boolean;
    owner: boolean;
    pending?: boolean;
    onFavorite: () => void;
    onOpen: () => void;
  };

function ProfileSourceCard({ sourceType, source, favorite, owner, pending = false, onFavorite, onOpen }: ProfileSourceCardProps) {
  const previewCards = sourceType === 'deck' ? getDeckPreviewCards(source) : getSetPreviewCards(source);
  const favoriteLabel = favorite ? 'Remove from favorites' : 'Add to favorites';
  const favoriteControl = owner
    ? <OverviewPreferenceButton label={favoriteLabel} onClick={onFavorite} active={favorite} pending={pending}><Star size={15} className={favorite ? 'fill-current' : ''} /></OverviewPreferenceButton>
    : favorite ? <span title="Favorite source" aria-label="Favorite source" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200/50 bg-amber-300/10 text-amber-200"><Star size={15} className="fill-current" /></span> : null;

  return (
    <article className="relative grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-amber-200/40">
      <button type="button" onClick={onOpen} className="grid min-w-0 gap-3 text-left focus:outline-none focus:ring-2 focus:ring-amber-200">
        <div className="min-w-0 pr-10">
          <h3 className="truncate text-lg font-black text-white" title={source.name}>{source.name}</h3>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400" title={source.description || 'No description'}>{source.description || 'No description'}</p>
        </div>
        {previewCards.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previewCards.map((card) => (
            <div key={card.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-center">
              <div className="relative mx-auto aspect-[744/1039] w-full max-w-[6rem] overflow-hidden rounded-lg bg-slate-900"><RiftboundCardImage card={card} sizes="96px" loading="lazy" className="object-cover" /></div>
              <p className="mt-1 truncate text-center text-[0.65rem] font-black text-slate-200" title={card.displayName}>{card.displayName}</p>
              <p className="mt-1 truncate text-center text-[0.58rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}</p>
            </div>
          ))}
        </div> : null}
      </button>
      {favoriteControl ? <div className="absolute right-4 top-4">{favoriteControl}</div> : null}
    </article>
  );
}

export function RiftboundProfile({ username }: { username?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<RiftboundProfileData | null>(null);
  const [section, setSection] = useState<ProfileSection>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSource, setSelectedSource] = useState<{ type: 'set' | 'deck'; id: string } | null>(null);
  const [selectedCard, setSelectedCard] = useState<RiftboundCard | null>(null);
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [profileAbout, setProfileAbout] = useState('');
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const [savingAction, setSavingAction] = useState('');
  const [preferenceError, setPreferenceError] = useState('');
  const [recentlyUnfavoritedCardIds, setRecentlyUnfavoritedCardIds] = useState<string[]>([]);
  const [recentlyRemovedWishlistEntries, setRecentlyRemovedWishlistEntries] = useState<RiftboundWishlistCard[]>([]);
  const [recentlyUnfavoritedDeckIds, setRecentlyUnfavoritedDeckIds] = useState<string[]>([]);
  const [collectionQuery, setCollectionQuery] = useState('');
  const [collectionSortMode, setCollectionSortMode] = useState<RiftboundSortMode>('none');
  const [collectionFiltersOpen, setCollectionFiltersOpen] = useState(false);
  const [collectionFilters, setCollectionFilters] = useState<RiftboundCardFilters>(() => createRiftboundCardFilters());

  useEffect(() => subscribeToAuthSession((nextSession) => setSession(nextSession)), []);

  useEffect(() => {
    if (!descriptionEditing || !descriptionInputRef.current) return;
    const input = descriptionInputRef.current;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [descriptionEditing]);

  const loadProfile = useCallback(async (showLoading = true) => {
    if (!username && !session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = username ? await getRiftboundPublicProfile(username, session) : await getRiftboundOwnerProfile(session as Session);
      setProfile(data.profile);
      setProfileAbout(data.profile.settings.about);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this Riftbound profile.');
    } finally {
      setLoading(false);
    }
  }, [session, username]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const collectionCardEntries = useMemo<ProfileCollectionCard[]>(() => {
    if (!profile) return [];
    const entries = new Map<string, ProfileCollectionCard>();
    profile.collection.items.forEach((item) => {
      const card = getRiftboundCardById(item.card_id);
      if (!card) return;
      const current = entries.get(card.id) ?? { card, normalQuantity: 0, foilQuantity: 0, totalQuantity: 0 };
      if (item.finish === 'foil') current.foilQuantity += item.quantity;
      else current.normalQuantity += item.quantity;
      current.totalQuantity += item.quantity;
      entries.set(card.id, current);
    });
    return Array.from(entries.values()).slice(0, 96);
  }, [profile]);

  const collectionQuantities = useMemo(
    () => new Map(collectionCardEntries.map((entry) => [entry.card.id, entry.totalQuantity])),
    [collectionCardEntries],
  );

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

  const estimatedCollectionValueCents = useMemo(
    () => profile ? getEstimatedCollectionValueCents(profile.collection.items) : 0,
    [profile],
  );

  const activeSource = useMemo(() => {
    if (!profile || !selectedSource) return null;
    return selectedSource.type === 'set'
      ? profile.sets.find((source) => source.id === selectedSource.id) ?? null
      : profile.decks.find((source) => source.id === selectedSource.id) ?? null;
  }, [profile, selectedSource]);

  const savePreference = async (body: Record<string, unknown>, actionKey: string) => {
    if (!session || !profile?.isOwner || savingAction) return false;
    setSavingAction(actionKey);
    setPreferenceError('');
    try {
      await updateRiftboundProfilePreference(body, session);
      await loadProfile(false);
      return true;
    } catch (saveError) {
      setPreferenceError(saveError instanceof Error ? saveError.message : 'Unable to save this Riftbound profile preference.');
      return false;
    } finally {
      setSavingAction('');
    }
  };

  const toggleFavoriteCard = (cardId: string) => {
    if (!profile) return;
    const enabled = !profile.favoriteCardIds.includes(cardId);
    if (enabled && profile.favoriteCardIds.length >= 4) return;
    void savePreference({ action: 'favorite-card', cardId, enabled }, `card:${cardId}`).then((saved) => {
      if (!saved) return;
      setRecentlyUnfavoritedCardIds((current) => enabled ? current.filter((id) => id !== cardId) : current.includes(cardId) ? current : [...current, cardId]);
    });
  };

  const toggleWishlist = (cardId: string) => {
    if (!profile) return;
    const existing = profile.wishlist.find((entry) => entry.cardId === cardId);
    const enabled = !existing;
    const visibleWishlistCount = profile.wishlist.length + recentlyRemovedWishlistEntries.filter((entry) => !profile.wishlist.some((current) => current.cardId === entry.cardId)).length;
    if (enabled && visibleWishlistCount >= 8) return;
    void savePreference({ action: 'wishlist', cardId, enabled, desiredQuantity: 1 }, `wishlist:${cardId}`).then((saved) => {
      if (!saved) return;
      if (enabled) {
        setRecentlyRemovedWishlistEntries((current) => current.filter((entry) => entry.cardId !== cardId));
      } else if (existing) {
        setRecentlyRemovedWishlistEntries((current) => current.some((entry) => entry.cardId === cardId) ? current : [...current, existing]);
      }
    });
  };

  const toggleFavoriteSource = (type: 'set' | 'deck', id: string) => {
    if (!profile) return;
    const favorites = type === 'set' ? profile.favoriteSetIds : profile.favoriteDeckIds;
    const enabled = !favorites.includes(id);
    if (type === 'deck' && enabled && profile.favoriteDeckIds.length >= 4) return;
    void savePreference({ action: type === 'set' ? 'favorite-set' : 'favorite-deck', sourceId: id, enabled }, `${type}:${id}`).then((saved) => {
      if (!saved || type !== 'deck') return;
      setRecentlyUnfavoritedDeckIds((current) => enabled ? current.filter((sourceId) => sourceId !== id) : current.includes(id) ? current : [...current, id]);
    });
  };

  const saveDescription = () => {
    if (!profile) return;
    void savePreference({ action: 'settings', visibility: profile.settings.visibility, about: profileAbout }, 'description').then((saved) => {
      if (saved) setDescriptionEditing(false);
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
    setCollectionSortMode('none');
    setCollectionFilters(createRiftboundCardFilters());
  };

  const toggleCollectionFilter = (field: RiftboundCategoricalFilterField, value: string) => {
    setCollectionFilters((current) => ({ ...current, [field]: toggleFilterValue(current[field], value) }));
  };

  const openKnowLeagueProfile = () => {
    if (typeof window !== 'undefined' && profile) {
      window.dispatchEvent(new CustomEvent('knowleague:open-profile', { detail: { username: profile.profile.username } }));
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-200/30 bg-slate-900 text-2xl font-black text-amber-200" style={profile.profile.avatarUrl ? { backgroundImage: `url(${profile.profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{profile.profile.avatarUrl ? null : profile.profile.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><Link href="/" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black uppercase tracking-[0.12em] text-slate-200 transition hover:border-amber-300/50 hover:text-amber-200"><Home size={14} /> Home</Link><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound Profile</p></div><h1 className="mt-2 truncate text-3xl font-black text-white sm:text-4xl" style={getChatNameStyle(profile.profile.chatColor)}><button type="button" onClick={openKnowLeagueProfile} className="truncate text-left transition hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200">{profile.profile.displayName || profile.profile.username}</button></h1><p className="mt-1 text-sm font-semibold text-slate-500"><button type="button" onClick={openKnowLeagueProfile} className="font-bold transition hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200">@{profile.profile.username}</button> <span aria-hidden="true">·</span> Joined {formatDate(profile.profile.createdAt)}</p></div>
            </div>
            <div className="flex flex-wrap gap-2"><Link href="/riftbound/community" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><Users size={15} /> Community</Link><Link href="/inventory" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><Package size={15} /> Inventory</Link></div>
          </div>
          <div className="flex w-full items-start gap-2">
            {descriptionEditing && profile.isOwner ? <div className="grid min-w-0 flex-1 gap-2"><textarea ref={descriptionInputRef} autoFocus value={profileAbout} onChange={(event) => setProfileAbout(event.target.value)} maxLength={500} rows={3} placeholder="Add a Riftbound profile description" className="resize-y rounded-xl border border-amber-200/30 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-amber-300" /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-600">{profileAbout.length}/500</span><div className="flex gap-2"><button type="button" onClick={() => { setProfileAbout(profile.settings.about); setDescriptionEditing(false); setPreferenceError(''); }} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-400 transition hover:border-white/25 hover:text-white">Cancel</button><button type="button" onClick={saveDescription} disabled={Boolean(savingAction)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-50">{savingAction === 'description' ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Save</button></div></div></div> : <p className={`max-w-3xl whitespace-pre-line text-sm leading-6 ${profile.settings.about ? 'text-slate-300' : 'italic text-slate-500'}`}>{profile.settings.about || 'No profile description'}</p>}
            {profile.isOwner && !descriptionEditing ? <button type="button" onClick={startDescriptionEdit} aria-label="Edit Riftbound profile description" title="Edit profile description" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-900 text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200"><Pencil size={14} /></button> : null}
          </div>
          {preferenceError && descriptionEditing ? <p className="text-sm font-semibold text-red-200">{preferenceError}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><ProfileStat label="Card Count" value={profile.collection.totalCopies} onClick={() => setSection('collection')} title="View collection" /><ProfileStat label="Collection Value" value={`~${formatValue(estimatedCollectionValueCents)}`} onClick={() => setSection('collection')} title="View collection" /><ProfileStat label="Decks" value={profile.decks.length} onClick={() => setSection('sources')} title="View sets and decks" /><ProfileStat label="Sets" value={profile.sets.length} onClick={() => setSection('sources')} title="View sets and decks" /></div>
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-900/70 p-1 sm:grid-cols-4">{(['overview', 'collection', 'sources', 'posts'] as ProfileSection[]).map((tab) => <button key={tab} type="button" onClick={() => setSection(tab)} className={`rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${section === tab ? 'bg-amber-300 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{tab === 'sources' ? 'Sets & Decks' : tab}</button>)}</div>
        </header>

        {section === 'overview' ? <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favorite Cards</p>{favoriteCards.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{favoriteCards.map((cardId) => { const favorite = profile.favoriteCardIds.includes(cardId); const pending = savingAction === `card:${cardId}`; return <OverviewCardTile key={cardId} cardId={cardId} onOpen={setSelectedCard} action={profile.isOwner ? <OverviewPreferenceButton label={favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => toggleFavoriteCard(cardId)} active={favorite} pending={pending}><Star size={14} className={favorite ? 'fill-current' : ''} /></OverviewPreferenceButton> : undefined} />; })}</div> : <p className="text-sm text-slate-500">No favorite cards selected yet.</p>}</section>
            <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Wishlist</p>{visibleWishlist.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{visibleWishlist.map((entry) => { const wishlisted = profile.wishlist.some((current) => current.cardId === entry.cardId); const pending = savingAction === `wishlist:${entry.cardId}`; return <OverviewCardTile key={entry.cardId} cardId={entry.cardId} onOpen={setSelectedCard} action={profile.isOwner ? <OverviewPreferenceButton label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'} onClick={() => toggleWishlist(entry.cardId)} active={wishlisted} pending={pending}>{wishlisted ? <Minus size={14} /> : <Plus size={14} />}</OverviewPreferenceButton> : undefined} />; })}</div> : <p className="text-sm text-slate-500">No wishlist cards yet.</p>}</section>
          </div>
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favorite Decks</p></div>{favoriteDecks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{favoriteDecks.map((source) => { const favorite = profile.favoriteDeckIds.includes(source.id); return <ProfileSourceCard key={source.id} sourceType="deck" source={source} favorite={favorite} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => { const shareUrl = getCompactDeckShareUrl(source, { createdBy: profile.profile.displayName || profile.profile.username, createdAt: source.updated_at || source.created_at }); window.open(shareUrl, '_blank', 'noopener,noreferrer'); }} />; })}</div> : <p className="text-sm text-slate-500">No favorite decks selected yet.</p>}</section>
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

            {collectionFilteredCards.length > 0 ? <div className="riftbound-card-grid">{collectionFilteredCards.map((entry) => <RiftboundCardRow key={entry.card.id} card={entry.card} normalQuantity={entry.normalQuantity} foilQuantity={entry.foilQuantity} mode="collection-view" pendingChange={false} pending={false} onOpen={(card) => setSelectedCard(card)} />)}</div> : <div className="grid justify-items-center gap-3 py-12 text-center text-sm text-slate-500"><PackageOpen size={32} className="text-amber-200" />{collectionCardEntries.length > 0 ? 'No collection cards match these filters.' : 'No public collection cards yet.'}</div>}
          </section>
        ) : null}

        {section === 'sources' ? (
          <div className="grid gap-6">
            <section className="order-1 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Game Decks</p><p className="mt-1 text-sm text-slate-500">Saved constructed decks.</p></div>
              {profile.decks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{profile.decks.map((source) => <ProfileSourceCard key={source.id} sourceType="deck" source={source} favorite={profile.favoriteDeckIds.includes(source.id)} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => { const shareUrl = getCompactDeckShareUrl(source, { createdBy: profile.profile.displayName || profile.profile.username, createdAt: source.updated_at || source.created_at }); window.open(shareUrl, '_blank', 'noopener,noreferrer'); }} />)}</div> : <p className="text-sm text-slate-500">No decks saved yet.</p>}
            </section>
            <section className="order-2 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Sets</p><p className="mt-1 text-sm text-slate-500">Saved Riftbound sets.</p></div>
              {profile.sets.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{profile.sets.map((source) => <ProfileSourceCard key={source.id} sourceType="set" source={source} favorite={profile.favoriteSetIds.includes(source.id)} owner={profile.isOwner} pending={savingAction === `set:${source.id}`} onFavorite={() => toggleFavoriteSource('set', source.id)} onOpen={() => setSelectedSource({ type: 'set', id: source.id })} />)}</div> : <p className="text-sm text-slate-500">No sets saved yet.</p>}
            </section>
            {activeSource && selectedSource?.type !== 'deck' ? <section className="order-3 grid gap-4 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Set Details</p><h2 className="mt-1 text-xl font-black text-white">{activeSource.name}</h2></div><button type="button" onClick={() => setSelectedSource(null)} aria-label="Close source details" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-400"><X size={15} /></button></div><div className="riftbound-card-grid">{activeSource.cards.map((entry) => <CardPreview key={`${entry.card_id}:${entry.quantity}`} cardId={entry.card_id} quantity={entry.quantity} />)}</div></section> : null}
          </div>
        ) : null}

        {section === 'posts' ? <section className="grid gap-4"><div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Recent Posts</p><p className="mt-1 text-sm text-slate-500">Posts from @{profile.profile.username}, newest first.</p></div>{profile.posts.length > 0 ? profile.posts.map((post) => <RiftboundCommunityPostCard key={post.id} post={post} session={session} />) : <div className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm text-slate-500">No Riftbound posts yet.</div>}</section> : null}
        {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={Boolean(savingAction)} showInventoryControls={false} showMarketDetails preferenceSession={session} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
      </section>
    </main>
  );
}
