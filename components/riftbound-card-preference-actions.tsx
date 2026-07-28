'use client';

import { LoaderCircle, Minus, Plus, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getRiftboundCardPreferences, updateRiftboundProfilePreference } from '@/lib/riftbound-community-client';
import type { RiftboundCardPreferences } from '@/lib/riftbound-community-types';

const FAVORITE_CARD_LIMIT = 4;
const WISHLIST_LIMIT = 8;

type PreferenceChange = {
  favorite: boolean;
  wishlist: boolean;
};

export function RiftboundCardPreferenceActions({ cardId, session, onChange }: { cardId: string; session?: Session | null; onChange?: (change: PreferenceChange) => void }) {
  const [preferences, setPreferences] = useState<RiftboundCardPreferences | null>(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState<'favorite' | 'wishlist' | null>(null);

  useEffect(() => {
    if (!session) {
      setPreferences(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getRiftboundCardPreferences(session)
      .then((data) => { if (!cancelled) setPreferences(data); })
      .catch(() => { if (!cancelled) setPreferences({ favoriteCardIds: [], wishlist: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) return null;

  const favorite = Boolean(preferences?.favoriteCardIds.includes(cardId));
  const wishlistEntry = preferences?.wishlist.find((entry) => entry.cardId === cardId);
  const wishlist = Boolean(wishlistEntry);
  const toggle = async (kind: 'favorite' | 'wishlist') => {
    if (!preferences || saving) return;
    const enabled = kind === 'favorite' ? !favorite : !wishlist;
    if (enabled && kind === 'favorite' && !favorite && preferences.favoriteCardIds.length >= FAVORITE_CARD_LIMIT) return;
    if (enabled && kind === 'wishlist' && !wishlist && preferences.wishlist.length >= WISHLIST_LIMIT) return;
    setSaving(kind);
    try {
      await updateRiftboundProfilePreference({ action: kind === 'favorite' ? 'favorite-card' : 'wishlist', cardId, enabled, desiredQuantity: 1 }, session);
      const nextPreferences = kind === 'favorite'
        ? { ...preferences, favoriteCardIds: enabled ? [...preferences.favoriteCardIds, cardId] : preferences.favoriteCardIds.filter((id) => id !== cardId) }
        : { ...preferences, wishlist: enabled ? [...preferences.wishlist, { cardId, desiredQuantity: 1, note: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] : preferences.wishlist.filter((entry) => entry.cardId !== cardId) };
      setPreferences(nextPreferences);
      onChange?.({ favorite: nextPreferences.favoriteCardIds.includes(cardId), wishlist: nextPreferences.wishlist.some((entry) => entry.cardId === cardId) });
    } finally {
      setSaving(null);
    }
  };

  const favoriteLabel = favorite ? 'Remove from favorites' : 'Add to favorites';
  const wishlistLabel = wishlist ? 'Remove from wishlist' : 'Add to wishlist';
  return <div className="inline-flex items-center gap-2">
    <button type="button" onClick={() => void toggle('favorite')} disabled={loading || Boolean(saving) || (!favorite && (preferences?.favoriteCardIds.length ?? FAVORITE_CARD_LIMIT) >= FAVORITE_CARD_LIMIT)} aria-label={favoriteLabel} title={favoriteLabel} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${favorite ? 'border-amber-200/60 bg-amber-300/15 text-amber-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-amber-200/50 hover:text-amber-200'}`}>{saving === 'favorite' ? <LoaderCircle size={15} className="animate-spin" /> : <Star size={15} className={favorite ? 'fill-current' : ''} />}</button>
    <button type="button" onClick={() => void toggle('wishlist')} disabled={loading || Boolean(saving) || (!wishlist && (preferences?.wishlist.length ?? WISHLIST_LIMIT) >= WISHLIST_LIMIT)} aria-label={wishlistLabel} title={wishlistLabel} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${wishlist ? 'border-cyan-200/60 bg-cyan-300/15 text-cyan-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-cyan-200/50 hover:text-cyan-200'}`}>{saving === 'wishlist' ? <LoaderCircle size={15} className="animate-spin" /> : wishlist ? <Minus size={15} /> : <Plus size={15} />}</button>
  </div>;
}
