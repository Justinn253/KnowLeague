'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { submitRiftboundCardTierVote } from '@/lib/riftbound-community-client';
import type { RiftboundCardTierRating } from '@/lib/riftbound-community-types';
import { RIFTBOUND_CARD_TIERS, type RiftboundCard, type RiftboundCardTier } from '@/lib/riftbound';

export function RiftboundCardTierVote({
  card,
  session,
  initialRating,
  onChange,
}: {
  card: RiftboundCard;
  session: Session;
  initialRating?: RiftboundCardTierRating | null;
  onChange?: (rating: RiftboundCardTierRating | null) => void;
}) {
  const [tier, setTier] = useState<RiftboundCardTier | null>(initialRating?.viewerTier ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setTier(initialRating?.viewerTier ?? null);
    setError('');
  }, [card.id, initialRating]);

  const selectTier = async (nextTier: RiftboundCardTier) => {
    if (saving) return;
    const previousTier = tier;
    setTier(nextTier);
    setError('');
    setSaving(true);
    try {
      const result = await submitRiftboundCardTierVote(card.id, nextTier, session);
      onChangeRef.current?.(result.rating);
    } catch (saveError: unknown) {
      setTier(previousTier);
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the card tier vote.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 w-full border-t border-white/10 pt-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tier Vote</p>
        {saving ? <LoaderCircle size={14} className="animate-spin text-slate-500" aria-label="Saving tier vote" /> : null}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="group" aria-label={`Choose a tier for ${card.displayName}`}>
        {RIFTBOUND_CARD_TIERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tier === option}
            disabled={saving}
            onClick={() => void selectTier(option)}
            className={`rounded-lg border px-2 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-60 ${tier === option ? 'border-amber-200 bg-amber-300 text-slate-950' : 'border-white/10 bg-slate-900 text-slate-300 hover:border-amber-200/50 hover:text-white'}`}
          >
            {option}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-red-200" role="alert">{error}</p> : null}
    </div>
  );
}
