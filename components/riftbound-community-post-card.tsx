'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageCircle, Share2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, getRiftboundCardRarityTextClass } from '@/lib/riftbound';
import { hasRiftboundPostBeenShared, markRiftboundPostShared, recordRiftboundPostShare, updateRiftboundPostReaction } from '@/lib/riftbound-community-client';
import type { RiftboundCommunityPostSummary, RiftboundPostReaction } from '@/lib/riftbound-community-types';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function postTypeLabel(type: RiftboundCommunityPostSummary['postType']) {
  if (type === 'general') return 'General';
  if (type === 'question') return 'Question';
  if (type === 'deck_build') return 'Deck Build';
  return type === 'collection' ? 'Collection' : type === 'set' ? 'Set' : 'Deck';
}

type RiftboundCommunityPostCardProps = {
  post: RiftboundCommunityPostSummary;
  session: Session | null;
  onPostChange?: (post: RiftboundCommunityPostSummary) => void;
};

export function RiftboundCommunityPostCard({ post, session, onPostChange }: RiftboundCommunityPostCardProps) {
  const router = useRouter();
  const [shareBusy, setShareBusy] = useState(false);
  const shareBusyRef = useRef(false);
  const [localReaction, setLocalReaction] = useState<RiftboundPostReaction | null>(post.viewerReaction);
  const localReactionRef = useRef<RiftboundPostReaction | null>(post.viewerReaction);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const likeCountRef = useRef(post.likeCount);
  const [dislikeCount, setDislikeCount] = useState(post.dislikeCount);
  const dislikeCountRef = useRef(post.dislikeCount);
  const reactionRequestRef = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    localReactionRef.current = post.viewerReaction;
    likeCountRef.current = post.likeCount;
    dislikeCountRef.current = post.dislikeCount;
    setLocalReaction(post.viewerReaction);
    setLikeCount(post.likeCount);
    setDislikeCount(post.dislikeCount);
  }, [post.dislikeCount, post.likeCount, post.viewerReaction]);
  const postHref = `/riftbound/community/${encodeURIComponent(post.id)}`;
  const previewCards = post.previewCardIds.flatMap((cardId) => {
    const card = getRiftboundCardById(cardId);
    return card ? [card] : [];
  });

  const updateReaction = (nextReaction: RiftboundPostReaction) => {
    if (!session) return;
    const previousReaction = localReactionRef.current;
    const nextValue = previousReaction === nextReaction ? null : nextReaction;
    const nextLikeCount = Math.max(0, likeCountRef.current - (previousReaction === 'like' ? 1 : 0) + (nextValue === 'like' ? 1 : 0));
    const nextDislikeCount = Math.max(0, dislikeCountRef.current - (previousReaction === 'dislike' ? 1 : 0) + (nextValue === 'dislike' ? 1 : 0));
    const applyReaction = (reaction: RiftboundPostReaction | null, likes: number, dislikes: number) => {
      localReactionRef.current = reaction;
      likeCountRef.current = likes;
      dislikeCountRef.current = dislikes;
      setLocalReaction(reaction);
      setLikeCount(likes);
      setDislikeCount(dislikes);
      onPostChange?.({ ...post, viewerReaction: reaction, likeCount: likes, dislikeCount: dislikes });
    };

    applyReaction(nextValue, nextLikeCount, nextDislikeCount);
    const request = reactionRequestRef.current
      .catch(() => undefined)
      .then(() => updateRiftboundPostReaction(post.id, nextValue, session));
    reactionRequestRef.current = request;
    void request.then((response) => {
      if (localReactionRef.current === nextValue) applyReaction(response.reaction, response.likeCount, response.dislikeCount);
    }).catch(() => {
      if (localReactionRef.current !== nextValue) return;
      applyReaction(
        previousReaction,
        Math.max(0, nextLikeCount - (nextValue === 'like' ? 1 : 0) + (previousReaction === 'like' ? 1 : 0)),
        Math.max(0, nextDislikeCount - (nextValue === 'dislike' ? 1 : 0) + (previousReaction === 'dislike' ? 1 : 0)),
      );
    });
  };

  const sharePost = async () => {
    if (shareBusyRef.current) return;
    shareBusyRef.current = true;
    setShareBusy(true);
    try {
      const url = `${window.location.origin}${postHref}`;
      if (navigator.share) await navigator.share({ title: post.title, text: post.body || post.title, url });
      else await navigator.clipboard.writeText(url);
      if (session && !hasRiftboundPostBeenShared(post.id, session.user.id)) {
        const response = await recordRiftboundPostShare(post.id, session);
        markRiftboundPostShared(post.id, session.user.id);
        onPostChange?.({ ...post, shareCount: response.shareCount });
      }
    } catch {
      // Closing the native share sheet is not an error for the page.
    } finally {
      shareBusyRef.current = false;
      setShareBusy(false);
    }
  };

  const openPost = () => router.push(postHref);
  const handlePostClick = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    openPost();
  };
  const handlePostKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPost();
    }
  };

  return (
    <article role="link" tabIndex={0} onClick={handlePostClick} onKeyDown={handlePostKeyDown} aria-label={`Open post ${post.title}`} className="grid cursor-pointer gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-amber-200/30 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-base font-black text-amber-200" style={post.author.avatarUrl ? { backgroundImage: `url(${post.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {post.author.avatarUrl ? null : post.author.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={postHref} className="block truncate text-xl font-black text-white hover:text-amber-200 sm:text-2xl">{post.title}</Link>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href={`/riftbound/profile/${encodeURIComponent(post.author.username)}`} className="font-black hover:underline" style={getChatNameStyle(post.author.chatColor)}>@{post.author.username}</Link>
            <span aria-hidden="true">·</span>
            <span>{formatDate(post.createdAt)}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-amber-200/20 bg-amber-300/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-amber-200">{postTypeLabel(post.postType)}</span>
      </div>

      {post.body ? <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-300">{post.body}</p> : null}

      {previewCards.length > 0 ? <div className={post.postType === 'deck_build' ? 'grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8' : 'riftbound-card-grid'}>
        {previewCards.map((card) => <Link key={card.id} href={postHref} className={`min-w-0 rounded-2xl border border-white/10 bg-slate-900/60 transition hover:border-amber-200/50 ${post.postType === 'deck_build' ? 'rounded-xl p-1' : 'riftbound-card-item p-2'}`}>
          <div className="relative aspect-[744/1039] overflow-hidden rounded-xl bg-slate-950"><RiftboundCardImage card={card} sizes={post.postType === 'deck_build' ? '120px' : '240px'} loading="lazy" className="object-cover" /></div>
          <p className={`${post.postType === 'deck_build' ? 'mt-1 text-[0.6rem]' : 'mt-2 text-xs'} truncate text-center font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</p>
          <p className="mt-0.5 truncate text-center text-[0.55rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} {card.numberLabel}</p>
        </Link>)}
      </div> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <button type="button" onClick={() => updateReaction('like')} disabled={!session} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localReaction === 'like' ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-emerald-200/40 hover:text-emerald-200'}`}><ThumbsUp size={14} /> {likeCount}</button>
        <button type="button" onClick={() => updateReaction('dislike')} disabled={!session} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localReaction === 'dislike' ? 'border-red-300/50 bg-red-300/10 text-red-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-red-200/40 hover:text-red-200'}`}><ThumbsDown size={14} /> {dislikeCount}</button>
        <Link href={`${postHref}#comments`} onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/40 hover:text-amber-200"><MessageCircle size={14} /> {post.commentCount}</Link>
        <button type="button" onClick={() => void sharePost()} disabled={shareBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/40 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50"><Share2 size={14} /> {post.shareCount > 0 ? post.shareCount : 'Share'}</button>
        {!session ? <span className="ml-auto text-[0.68rem] font-semibold text-slate-600">Sign in to react</span> : null}
      </div>
    </article>
  );
}
