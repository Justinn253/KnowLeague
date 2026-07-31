'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { updateRiftboundSharedDeckReaction } from '@/lib/riftbound-community-client';
import type { RiftboundPostReaction, RiftboundSharedDeckSummary } from '@/lib/riftbound-community-types';

type RiftboundSharedDeckReactionsProps = {
  deck: RiftboundSharedDeckSummary;
  session: Session | null;
  onDeckChange?: (deck: RiftboundSharedDeckSummary) => void;
  compact?: boolean;
  showLabel?: boolean;
  showSignInHint?: boolean;
};

export function RiftboundSharedDeckReactions({ deck, session, onDeckChange, compact = false, showLabel = true, showSignInHint = true }: RiftboundSharedDeckReactionsProps) {
  const [reaction, setReaction] = useState<RiftboundPostReaction | null>(deck.viewerReaction);
  const reactionRef = useRef<RiftboundPostReaction | null>(deck.viewerReaction);
  const [likeCount, setLikeCount] = useState(deck.likeCount);
  const likeCountRef = useRef(deck.likeCount);
  const [dislikeCount, setDislikeCount] = useState(deck.dislikeCount);
  const dislikeCountRef = useRef(deck.dislikeCount);
  const requestRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    reactionRef.current = deck.viewerReaction;
    likeCountRef.current = deck.likeCount;
    dislikeCountRef.current = deck.dislikeCount;
    setReaction(deck.viewerReaction);
    setLikeCount(deck.likeCount);
    setDislikeCount(deck.dislikeCount);
  }, [deck.dislikeCount, deck.likeCount, deck.viewerReaction]);

  const updateReaction = (nextReaction: RiftboundPostReaction) => {
    if (!session) return;
    const previousReaction = reactionRef.current;
    const nextValue = previousReaction === nextReaction ? null : nextReaction;
    const nextLikeCount = Math.max(0, likeCountRef.current - (previousReaction === 'like' ? 1 : 0) + (nextValue === 'like' ? 1 : 0));
    const nextDislikeCount = Math.max(0, dislikeCountRef.current - (previousReaction === 'dislike' ? 1 : 0) + (nextValue === 'dislike' ? 1 : 0));
    const apply = (value: RiftboundPostReaction | null, likes: number, dislikes: number) => {
      reactionRef.current = value;
      likeCountRef.current = likes;
      dislikeCountRef.current = dislikes;
      setReaction(value);
      setLikeCount(likes);
      setDislikeCount(dislikes);
      onDeckChange?.({ ...deck, viewerReaction: value, likeCount: likes, dislikeCount: dislikes });
    };

    apply(nextValue, nextLikeCount, nextDislikeCount);
    const request = requestRef.current
      .catch(() => undefined)
      .then(() => updateRiftboundSharedDeckReaction(deck.id, nextValue, session));
    requestRef.current = request;
    void request.then((result) => {
      if (reactionRef.current !== nextValue) return;
      apply(result.reaction, result.likeCount, result.dislikeCount);
    }).catch(() => {
      if (reactionRef.current !== nextValue) return;
      apply(
        previousReaction,
        Math.max(0, nextLikeCount - (nextValue === 'like' ? 1 : 0) + (previousReaction === 'like' ? 1 : 0)),
        Math.max(0, nextDislikeCount - (nextValue === 'dislike' ? 1 : 0) + (previousReaction === 'dislike' ? 1 : 0)),
      );
    });
  };

  return (
    <div className={`grid justify-items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {showLabel ? <span className="text-[0.62rem] font-black uppercase tracking-[0.15em] text-slate-500">Rate this deck</span> : null}
      <div className="flex items-center gap-1.5" role="group" aria-label="Rate this shared deck">
        <button type="button" onClick={() => updateReaction('like')} disabled={!session} aria-label={`Like deck (${likeCount})`} aria-pressed={reaction === 'like'} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${reaction === 'like' ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-emerald-200/40 hover:text-emerald-200'}`}><ThumbsUp size={13} /> {likeCount}</button>
        <button type="button" onClick={() => updateReaction('dislike')} disabled={!session} aria-label={`Dislike deck (${dislikeCount})`} aria-pressed={reaction === 'dislike'} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${reaction === 'dislike' ? 'border-red-300/50 bg-red-300/10 text-red-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-red-200/40 hover:text-red-200'}`}><ThumbsDown size={13} /> {dislikeCount}</button>
      </div>
      {!session && showSignInHint ? <span className="text-[0.62rem] font-semibold text-slate-600">Sign in to react</span> : null}
    </div>
  );
}
