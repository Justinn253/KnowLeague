'use client';

import Link from 'next/link';
import { MessageCircle, Share2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById } from '@/lib/riftbound';
import { recordRiftboundPostShare, updateRiftboundPostReaction } from '@/lib/riftbound-community-client';
import type { RiftboundCommunityPostSummary, RiftboundPostReaction } from '@/lib/riftbound-community-types';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function formatValue(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function postTypeLabel(type: RiftboundCommunityPostSummary['postType']) {
  return type === 'collection' ? 'Collection' : type === 'set' ? 'Set' : 'Deck';
}

type RiftboundCommunityPostCardProps = {
  post: RiftboundCommunityPostSummary;
  session: Session | null;
  onPostChange?: (post: RiftboundCommunityPostSummary) => void;
};

export function RiftboundCommunityPostCard({ post, session, onPostChange }: RiftboundCommunityPostCardProps) {
  const [reactionBusy, setReactionBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [localReaction, setLocalReaction] = useState<RiftboundPostReaction | null>(post.viewerReaction);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [dislikeCount, setDislikeCount] = useState(post.dislikeCount);
  const previewCards = post.previewCardIds.flatMap((cardId) => {
    const card = getRiftboundCardById(cardId);
    return card ? [card] : [];
  });

  const updateReaction = async (nextReaction: RiftboundPostReaction) => {
    if (!session || reactionBusy) return;
    setReactionBusy(true);
    try {
      const response = await updateRiftboundPostReaction(post.id, localReaction === nextReaction ? null : nextReaction, session);
      setLocalReaction(response.reaction);
      setLikeCount(response.likeCount);
      setDislikeCount(response.dislikeCount);
      onPostChange?.({ ...post, viewerReaction: response.reaction, likeCount: response.likeCount, dislikeCount: response.dislikeCount });
    } catch {
      // Keep the current counts when a transient request fails.
    } finally {
      setReactionBusy(false);
    }
  };

  const sharePost = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const url = `${window.location.origin}/riftbound/community/${encodeURIComponent(post.id)}`;
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.body || post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      const response = await recordRiftboundPostShare(post.id);
      onPostChange?.({ ...post, shareCount: response.shareCount });
    } catch {
      // Closing the native share sheet is not an error for the page.
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <article className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-900 text-sm font-black text-amber-200" style={post.author.avatarUrl ? { backgroundImage: `url(${post.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
            {post.author.avatarUrl ? null : post.author.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link href={`/riftbound/profile/${encodeURIComponent(post.author.username)}`} className="truncate text-sm font-black hover:underline" style={getChatNameStyle(post.author.chatColor)}>
              {post.author.displayName || post.author.username}
            </Link>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{postTypeLabel(post.postType)} · {formatDate(post.createdAt)}</p>
          </div>
        </div>
        <span className="rounded-lg border border-amber-200/20 bg-amber-300/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-amber-200">
          {postTypeLabel(post.postType)}
        </span>
      </div>

      <div>
        <Link href={`/riftbound/community/${encodeURIComponent(post.id)}`} className="text-xl font-black text-white hover:text-amber-200 sm:text-2xl">
          {post.title}
        </Link>
        {post.body ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-300">{post.body}</p> : null}
      </div>

      {previewCards.length > 0 ? (
        <div className="riftbound-card-grid">
          {previewCards.map((card) => (
            <Link key={card.id} href={`/riftbound/community/${encodeURIComponent(post.id)}`} className="riftbound-card-item min-w-0 rounded-2xl border border-white/10 bg-slate-900/60 p-2 transition hover:border-amber-200/50">
              <div className="relative aspect-[744/1039] overflow-hidden rounded-xl bg-slate-950">
                <RiftboundCardImage card={card} sizes="160px" loading="lazy" className="object-cover" />
              </div>
              <p className="mt-2 truncate text-xs font-black text-slate-200" title={card.displayName}>{card.displayName}</p>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
        <span>{post.totalCardCount} unique · {post.totalCopyCount} copies</span>
        <span>·</span>
        <span>{formatValue(post.totalValueCents)}</span>
        {post.hasSideboard ? <span className="rounded-md border border-cyan-200/20 bg-cyan-300/10 px-2 py-1 text-cyan-200">Sideboard</span> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <button type="button" onClick={() => void updateReaction('like')} disabled={!session || reactionBusy} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localReaction === 'like' ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-emerald-200/40 hover:text-emerald-200'}`}>
          <ThumbsUp size={14} /> {likeCount}
        </button>
        <button type="button" onClick={() => void updateReaction('dislike')} disabled={!session || reactionBusy} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localReaction === 'dislike' ? 'border-red-300/50 bg-red-300/10 text-red-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-red-200/40 hover:text-red-200'}`}>
          <ThumbsDown size={14} /> {dislikeCount}
        </button>
        <Link href={`/riftbound/community/${encodeURIComponent(post.id)}#comments`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/40 hover:text-amber-200">
          <MessageCircle size={14} /> {post.commentCount}
        </Link>
        <button type="button" onClick={() => void sharePost()} disabled={shareBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/40 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50">
          <Share2 size={14} /> {post.shareCount > 0 ? post.shareCount : 'Share'}
        </button>
        {!session ? <span className="ml-auto text-[0.68rem] font-semibold text-slate-600">Sign in to react</span> : null}
      </div>
    </article>
  );
}
