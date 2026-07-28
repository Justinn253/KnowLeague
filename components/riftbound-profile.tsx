'use client';

import Link from 'next/link';
import { Check, LoaderCircle, Minus, Package, PackageOpen, Pencil, Plus, Star, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getCompactDeckShareUrl, RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundCommunityPostCard } from '@/components/riftbound-community-post-card';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, type RiftboundCard } from '@/lib/riftbound';
import { getRiftboundOwnerProfile, getRiftboundPublicProfile, updateRiftboundProfilePreference } from '@/lib/riftbound-community-client';
import type { RiftboundProfileData, RiftboundProfileSourceSummary, RiftboundWishlistCard } from '@/lib/riftbound-community-types';

type ProfileSection = 'overview' | 'collection' | 'sources' | 'posts';

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

function OverviewCardTile({ cardId, onOpen, action }: { cardId: string; onOpen: (card: RiftboundCard) => void; action?: ReactNode }) {
  const card = getRiftboundCardById(cardId);
  if (!card) return null;
  return <article className="group relative min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-2 transition hover:border-amber-200/50 hover:bg-slate-800"><button type="button" onClick={() => onOpen(card)} className="block w-full min-w-0 text-center focus:outline-none focus:ring-2 focus:ring-amber-200"><div className="relative mx-auto aspect-[744/1039] w-full max-w-[8rem] overflow-hidden rounded-lg bg-slate-950"><RiftboundCardImage card={card} sizes="128px" className="object-cover" /></div><p className="mt-2 truncate text-center text-sm font-black text-slate-200" title={card.displayName}>{card.displayName}</p><p className="mt-1 truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</p></button>{action ? <div className="pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">{action}</div> : null}</article>;
}

function OverviewPreferenceButton({ label, onClick, active, pending = false, children }: { label: string; onClick: () => void; active: boolean; pending?: boolean; children: ReactNode }) {
  return <button type="button" onClick={onClick} disabled={pending} aria-label={label} title={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-80 disabled:hover:scale-100 ${active ? 'border-amber-200 bg-amber-300 text-slate-950 hover:bg-amber-200' : 'border-amber-200/70 bg-slate-700 text-white hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950'}`}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : children}</button>;
}

function FavoriteDeckCard({ source, favorite, owner, pending = false, onFavorite, onOpen }: { source: RiftboundProfileData['decks'][number]; favorite: boolean; owner: boolean; pending?: boolean; onFavorite: () => void; onOpen: () => void }) {
  const favoriteLabel = favorite ? 'Remove from favorites' : 'Add to favorites';
  return <article className="relative grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-amber-200/40"><button type="button" onClick={onOpen} className="grid min-w-0 gap-3 text-left focus:outline-none focus:ring-2 focus:ring-amber-200"><div className="min-w-0 pr-10"><h3 className="truncate text-lg font-black text-white" title={source.name}>{source.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400" title={source.description || 'No description'}>{source.description || 'No description'}</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{source.previewCardIds.map((cardId) => { const card = getRiftboundCardById(cardId); if (!card) return null; return <div key={cardId} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-center"><div className="relative mx-auto aspect-[744/1039] w-full max-w-[6rem] overflow-hidden rounded-lg bg-slate-900"><RiftboundCardImage card={card} sizes="96px" loading="lazy" className="object-cover" /></div><p className="mt-1 truncate text-center text-[0.65rem] font-black text-slate-200" title={card.displayName}>{card.displayName}</p><p className="mt-1 truncate text-center text-[0.58rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} · {card.numberLabel}</p></div>; })}</div></button>{owner ? <div className="absolute right-4 top-4"><OverviewPreferenceButton label={favoriteLabel} onClick={onFavorite} active={favorite} pending={pending}><Star size={15} className={favorite ? 'fill-current' : ''} /></OverviewPreferenceButton></div> : null}</article>;
}

function SourceSummaryCard({ source, favorite, owner, pending = false, onFavorite, onOpen }: { source: RiftboundProfileSourceSummary; favorite: boolean; owner: boolean; pending?: boolean; onFavorite: () => void; onOpen: () => void }) {
  const favoriteControl = owner
    ? <button type="button" onClick={onFavorite} disabled={pending} aria-label={favorite ? `Remove from favorites` : `Add to favorites`} title={favorite ? 'Remove from favorites' : 'Add to favorites'} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition disabled:cursor-wait disabled:opacity-80 ${favorite ? 'border-amber-200/50 bg-amber-300/10 text-amber-200' : 'border-white/10 bg-slate-950 text-slate-500 hover:border-amber-200/40 hover:text-amber-200'}`}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Star size={16} className={favorite ? 'fill-current' : ''} />}</button>
    : favorite ? <span title="Favorite source" aria-label="Favorite source" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/50 bg-amber-300/10 text-amber-200"><Star size={16} className="fill-current" /></span> : null;
  return <article className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-black text-white">{source.name}</h3><p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{source.cardCount} unique · {source.copyCount} copies</p></div>{favoriteControl}</div><div className="grid grid-cols-4 gap-2">{source.previewCardIds.map((cardId) => <CardPreview key={cardId} cardId={cardId} />)}</div><button type="button" onClick={onOpen} className="justify-self-start rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200">View Details</button></article>;
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

  const collectionCards = useMemo(() => {
    if (!profile) return [];
    const quantities = new Map<string, number>();
    profile.collection.items.forEach((item) => quantities.set(item.card_id, (quantities.get(item.card_id) ?? 0) + item.quantity));
    return Array.from(quantities.entries()).slice(0, 96);
  }, [profile]);

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

  if (loading) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto max-w-[1200px] rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading Riftbound profile...</div></main>;
  if (error || !profile) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto grid max-w-[1200px] gap-4 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error || 'Sign in to view your Riftbound profile.'}</p><Link href="/login" className="mx-auto rounded-xl border border-red-200/30 px-4 py-2 text-xs font-black uppercase tracking-[0.1em]">Sign In</Link></div></main>;

  const favoriteCards = Array.from(new Set([...profile.favoriteCardIds, ...recentlyUnfavoritedCardIds])).filter((cardId) => getRiftboundCardById(cardId)).slice(0, 4);
  const visibleWishlist = [...profile.wishlist, ...recentlyRemovedWishlistEntries.filter((entry) => !profile.wishlist.some((current) => current.cardId === entry.cardId))].filter((entry) => getRiftboundCardById(entry.cardId)).slice(0, 8);
  const favoriteDecks = profile.decks.filter((deck) => profile.favoriteDeckIds.includes(deck.id) || recentlyUnfavoritedDeckIds.includes(deck.id)).slice(0, 4);

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1200px] gap-6">
        <header className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-200/30 bg-slate-900 text-2xl font-black text-amber-200" style={profile.profile.avatarUrl ? { backgroundImage: `url(${profile.profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{profile.profile.avatarUrl ? null : profile.profile.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Riftbound Profile</p><h1 className="mt-2 truncate text-3xl font-black text-white sm:text-4xl" style={getChatNameStyle(profile.profile.chatColor)}>{profile.profile.displayName || profile.profile.username}</h1><p className="mt-1 text-sm font-semibold text-slate-500">@{profile.profile.username} · Joined {formatDate(profile.profile.createdAt)}</p></div>
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
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favorite Decks</p></div>{favoriteDecks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{favoriteDecks.map((source) => { const favorite = profile.favoriteDeckIds.includes(source.id); return <FavoriteDeckCard key={source.id} source={source} favorite={favorite} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => { const shareUrl = getCompactDeckShareUrl(source, { createdBy: profile.profile.displayName || profile.profile.username, createdAt: source.updated_at || source.created_at }); window.open(shareUrl, '_blank', 'noopener,noreferrer'); }} />; })}</div> : <p className="text-sm text-slate-500">No favorite decks selected yet.</p>}</section>
        </div> : null}

        {section === 'collection' ? <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Collection</p><p className="mt-1 text-sm text-slate-500">Showing up to 96 unique cards for a fast profile view.</p></div><span className="text-sm font-black text-emerald-300">{formatValue(profile.collection.totalValueCents)}</span></div>{collectionCards.length > 0 ? <div className="riftbound-card-grid">{collectionCards.map(([cardId, quantity]) => <CardPreview key={cardId} cardId={cardId} quantity={quantity} />)}</div> : <div className="grid justify-items-center gap-3 py-12 text-center text-sm text-slate-500"><PackageOpen size={32} className="text-amber-200" />No public collection cards yet.</div>}</section> : null}

        {section === 'sources' ? (
          <div className="grid gap-6">
            <section className="order-1 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Game Decks</p><p className="mt-1 text-sm text-slate-500">Saved constructed decks.</p></div>
              {profile.decks.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{profile.decks.map((source) => <div key={source.id}><SourceSummaryCard source={source} favorite={profile.favoriteDeckIds.includes(source.id)} owner={profile.isOwner} pending={savingAction === `deck:${source.id}`} onFavorite={() => toggleFavoriteSource('deck', source.id)} onOpen={() => setSelectedSource({ type: 'deck', id: source.id })} /></div>)}</div> : <p className="text-sm text-slate-500">No decks saved yet.</p>}
            </section>
            <section className="order-2 grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Sets</p><p className="mt-1 text-sm text-slate-500">Saved Riftbound sets.</p></div>
              {profile.sets.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{profile.sets.map((source) => <div key={source.id}><SourceSummaryCard source={source} favorite={profile.favoriteSetIds.includes(source.id)} owner={profile.isOwner} pending={savingAction === `set:${source.id}`} onFavorite={() => toggleFavoriteSource('set', source.id)} onOpen={() => setSelectedSource({ type: 'set', id: source.id })} /></div>)}</div> : <p className="text-sm text-slate-500">No sets saved yet.</p>}
            </section>
            {activeSource ? <section className="order-3 grid gap-4 rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{selectedSource?.type === 'deck' ? 'Deck' : 'Set'} Details</p><h2 className="mt-1 text-xl font-black text-white">{activeSource.name}</h2></div><button type="button" onClick={() => setSelectedSource(null)} aria-label="Close source details" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-400"><X size={15} /></button></div><div className="riftbound-card-grid">{activeSource.cards.map((entry) => <CardPreview key={`${entry.card_id}:${entry.quantity}`} cardId={entry.card_id} quantity={entry.quantity} />)}</div></section> : null}
          </div>
        ) : null}

        {section === 'posts' ? <section className="grid gap-4"><div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Recent Posts</p><p className="mt-1 text-sm text-slate-500">Posts from @{profile.profile.username}, newest first.</p></div>{profile.posts.length > 0 ? profile.posts.map((post) => <RiftboundCommunityPostCard key={post.id} post={post} session={session} />) : <div className="rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm text-slate-500">No Riftbound posts yet.</div>}</section> : null}
        {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={Boolean(savingAction)} showInventoryControls={false} showMarketDetails preferenceSession={session} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
      </section>
    </main>
  );
}
