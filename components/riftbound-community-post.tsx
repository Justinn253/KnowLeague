'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ellipsis, LoaderCircle, MessageCircle, Pencil, Send, Share2, ShieldAlert, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { RiftboundCompactDeckView, type RiftboundCompactDeckEntry } from '@/components/riftbound-compact-deck-view';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, getRiftboundCardRarityTextClass, getRiftboundCardTierGroupId, type RiftboundCardTier } from '@/lib/riftbound';
import { isRiftboundChampionUnit } from '@/lib/riftbound-decks';
import {
  createRiftboundComment,
  deleteRiftboundCommunityPost,
  getRiftboundCommunityComments,
  getRiftboundCommunityPost,
  hasRiftboundPostBeenShared,
  isRiftboundRateLimitError,
  markRiftboundPostShared,
  recordRiftboundPostShare,
  submitRiftboundPostReport,
  updateRiftboundCommunityPost,
  updateRiftboundPostReaction,
} from '@/lib/riftbound-community-client';
import { RIFTBOUND_POST_BODY_MAX_LENGTH, type RiftboundCardTierRating, type RiftboundCommunityComment, type RiftboundCommunityPostDetail, type RiftboundPostReaction, type RiftboundPostSnapshotCard } from '@/lib/riftbound-community-types';

const categoryLabels: Record<RiftboundPostSnapshotCard['category'], string> = {
  collection: 'Collection',
  set: 'Set Cards',
  deck: 'Deck Cards',
  legend: 'Legend',
  runes: 'Runes',
  battlefields: 'Battlefields',
  main: 'Main Deck',
  sideboard: 'Sideboard',
};

const reportOptions = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate', label: 'Hate or abuse' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Other' },
] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function postTypeLabel(type: RiftboundCommunityPostDetail['postType']) {
  if (type === 'general') return 'General';
  if (type === 'question') return 'Question';
  if (type === 'deck_build') return 'Deck Build';
  return type === 'collection' ? 'Collection' : type === 'set' ? 'Set' : 'Deck';
}

function RiftboundCommunityPostHeader({ post }: { post: RiftboundCommunityPostDetail }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-lg font-black text-amber-200" style={post.author.avatarUrl ? { backgroundImage: `url(${post.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {post.author.avatarUrl ? null : post.author.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-white sm:text-3xl">{post.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href={`/riftbound/profile/${encodeURIComponent(post.author.username)}`} className="font-black hover:underline" style={getChatNameStyle(post.author.chatColor)}>@{post.author.username}</Link>
            <span aria-hidden="true">·</span>
            <span>{formatDate(post.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center rounded-lg border border-amber-200/25 bg-amber-300/10 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-200">{postTypeLabel(post.postType)}</span>
          </div>
        </div>
      </div>
      {post.body ? <p className="whitespace-pre-line text-sm leading-6 text-slate-300">{post.body}</p> : null}
    </div>
  );
}

function RiftboundPostCardRow({ entry, tierVote }: { entry: RiftboundPostSnapshotCard; tierVote?: RiftboundCardTier }) {
  const card = getRiftboundCardById(entry.card_id);
  if (!card) return null;
  return (
    <article className="riftbound-card-item min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="relative aspect-[744/1039] overflow-hidden rounded-xl bg-slate-900"><RiftboundCardImage card={card} sizes="220px" loading="lazy" className="object-cover" /></div>
      <p className={`mt-2 truncate text-sm font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}{tierVote ? ` · ${tierVote}` : ''}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-400">
        <span>{entry.category === 'collection' ? entry.finish : categoryLabels[entry.category]}</span>
        <span className="rounded-md border border-amber-200/20 bg-amber-300/10 px-1.5 py-0.5 text-amber-200">×{entry.quantity}</span>
      </div>
    </article>
  );
}

function CommentItem({ comment }: { comment: RiftboundCommunityComment }) {
  return (
    <article className="grid gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-950 text-xs font-black text-amber-200" style={comment.author.avatarUrl ? { backgroundImage: `url(${comment.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {comment.author.avatarUrl ? null : comment.author.displayName.slice(0, 1).toUpperCase()}
        </div>
        <Link href={`/riftbound/profile/${encodeURIComponent(comment.author.username)}`} className="text-sm font-black hover:underline" style={getChatNameStyle(comment.author.chatColor)}>{comment.author.displayName || comment.author.username}</Link>
        <span className="text-xs font-semibold text-slate-600">{formatDate(comment.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-slate-300">{comment.body}</p>
    </article>
  );
}

function ReportMenu({
  reason,
  details,
  saving,
  onReasonChange,
  onDetailsChange,
  onSubmit,
}: {
  reason: (typeof reportOptions)[number]['value'];
  details: string;
  saving: boolean;
  onReasonChange: (value: (typeof reportOptions)[number]['value']) => void;
  onDetailsChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-3 rounded-2xl border border-red-300/20 bg-slate-950 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200">Report post</p>
      <select value={reason} onChange={(event) => onReasonChange(event.target.value as (typeof reportOptions)[number]['value'])} className="h-11 rounded-xl border border-red-200/20 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-red-200">
        {reportOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <textarea value={details} onChange={(event) => onDetailsChange(event.target.value)} maxLength={500} rows={3} placeholder="Optional details" className="resize-y rounded-xl border border-red-200/20 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-red-200" />
      <div className="flex justify-end">
        <button type="button" onClick={onSubmit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-red-200/30 bg-red-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-red-200 disabled:opacity-50">
          {saving ? <LoaderCircle size={14} className="animate-spin" /> : null}
          Submit Report
        </button>
      </div>
    </div>
  );
}

export function RiftboundCommunityPost({ postId }: { postId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tierRatings, setTierRatings] = useState<Record<string, RiftboundCardTierRating>>({});
  const [post, setPost] = useState<RiftboundCommunityPostDetail | null>(null);
  const [comments, setComments] = useState<RiftboundCommunityComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const commentsCursorRef = useRef<string | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsMoreLoading, setCommentsMoreLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [error, setError] = useState('');
  const [commentError, setCommentError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof reportOptions)[number]['value']>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSaving, setReportSaving] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [localReaction, setLocalReaction] = useState<RiftboundPostReaction | null>(null);
  const localReactionRef = useRef<RiftboundPostReaction | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const likeCountRef = useRef(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const dislikeCountRef = useRef(0);
  const reactionRequestRef = useRef<Promise<unknown>>(Promise.resolve());
  const [selectedCard, setSelectedCard] = useState<import('@/lib/riftbound').RiftboundCard | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [shareBusy, setShareBusy] = useState(false);
  const shareBusyRef = useRef(false);
  const [shareCompleted, setShareCompleted] = useState(false);

  useEffect(() => subscribeToAuthSession((nextSession) => setSession(nextSession)), []);

  useEffect(() => {
    setShareCompleted(Boolean(session && hasRiftboundPostBeenShared(postId, session.user.id)));
  }, [postId, session]);

  useEffect(() => {
    if (!postMenuOpen && !reportOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setPostMenuOpen(false);
        setReportOpen(false);
        setDeleteConfirmOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPostMenuOpen(false);
        setReportOpen(false);
        setDeleteConfirmOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [postMenuOpen, reportOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined') setShareUrl(`${window.location.origin}/riftbound/community/${encodeURIComponent(postId)}`);
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getRiftboundCommunityPost(postId, session)
      .then((data) => {
        if (cancelled) return;
        setPost(data.post);
        setTierRatings(data.post.cardTiers ?? {});
        setLocalReaction(data.post.viewerReaction);
        localReactionRef.current = data.post.viewerReaction;
        setLikeCount(data.post.likeCount);
        likeCountRef.current = data.post.likeCount;
        setDislikeCount(data.post.dislikeCount);
        dislikeCountRef.current = data.post.dislikeCount;
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load this Riftbound post.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [postId, session]);

  const loadComments = useCallback(async (append = false) => {
    if (append) setCommentsMoreLoading(true);
    else setCommentsLoading(true);
    setCommentError('');
    try {
      const data = await getRiftboundCommunityComments(postId, append ? commentsCursorRef.current : null, session);
      setComments((current) => append ? [...current, ...data.comments] : data.comments);
      commentsCursorRef.current = data.nextCursor;
      setCommentsCursor(data.nextCursor);
    } catch (loadError) {
      setCommentError(isRiftboundRateLimitError(loadError) ? '' : loadError instanceof Error ? loadError.message : 'Unable to load comments.');
    } finally {
      setCommentsLoading(false);
      setCommentsMoreLoading(false);
    }
  }, [postId, session]);

  useEffect(() => {
    commentsCursorRef.current = null;
    setCommentsCursor(null);
    void loadComments(false);
  }, [loadComments]);

  const groupedCards = useMemo(() => {
    if (!post) return [];
    const groups = new Map<RiftboundPostSnapshotCard['category'], RiftboundPostSnapshotCard[]>();
    post.cards.forEach((entry) => {
      const rows = groups.get(entry.category) ?? [];
      rows.push(entry);
      groups.set(entry.category, rows);
    });
    return Array.from(groups.entries());
  }, [post]);

  const compactDeckEntries = useMemo(() => {
    if (!post) return null;
    const collapse = (entries: RiftboundPostSnapshotCard[]) => {
      const collapsed = new Map<string, RiftboundCompactDeckEntry>();
      entries.forEach((entry) => {
        const card = getRiftboundCardById(entry.card_id);
        if (!card) return;
        const existing = collapsed.get(card.id);
        collapsed.set(card.id, { card, quantity: (existing?.quantity ?? 0) + entry.quantity });
      });
      return Array.from(collapsed.values());
    };
    const isChampionEntry = (entry: RiftboundPostSnapshotCard) => {
      const card = getRiftboundCardById(entry.card_id);
      return Boolean(card && isRiftboundChampionUnit(card));
    };
    return {
      legendEntries: collapse(post.cards.filter((entry) => entry.category === 'legend')),
      championEntries: collapse(post.cards.filter((entry) => entry.category === 'main' && isChampionEntry(entry))),
      mainEntries: collapse(post.cards.filter((entry) => entry.category === 'main' && !isChampionEntry(entry))),
      runeEntries: collapse(post.cards.filter((entry) => entry.category === 'runes')),
      battlefieldEntries: collapse(post.cards.filter((entry) => entry.category === 'battlefields')),
      sideboardEntries: collapse(post.cards.filter((entry) => entry.category === 'sideboard')),
    };
  }, [post]);

  const addComment = async () => {
    if (!session || commentSaving || !commentBody.trim()) return;
    setCommentSaving(true);
    setCommentError('');
    try {
      const data = await createRiftboundComment(postId, commentBody, session);
      setComments((current) => [data.comment, ...current]);
      setCommentBody('');
      setPost((current) => current ? { ...current, commentCount: current.commentCount + 1 } : current);
    } catch (saveError) {
      setCommentError(isRiftboundRateLimitError(saveError) ? '' : saveError instanceof Error ? saveError.message : 'Unable to add your comment.');
    } finally {
      setCommentSaving(false);
    }
  };

  const submitReport = async () => {
    if (!session || reportSaving) return;
    setReportSaving(true);
    setReportMessage('');
    try {
      const reportLabel = reportOptions.find((option) => option.value === reportReason)?.label ?? reportReason;
      await submitRiftboundPostReport({
        message: [`Riftbound community post report`, `Post: ${post?.title ?? postId}`, `Post ID: ${postId}`, `Reason: ${reportLabel}`, reportDetails.trim() ? `Details: ${reportDetails.trim()}` : ''].filter(Boolean).join('\n'),
        reportedUsername: post?.author.username ?? '',
        pagePath: `/riftbound/community/${encodeURIComponent(postId)}`,
      }, session);
      setReportMessage('Report submitted to moderation. Thank you.');
      setReportOpen(false);
      setReportDetails('');
    } catch (reportError) {
      setReportMessage(isRiftboundRateLimitError(reportError) ? '' : reportError instanceof Error ? reportError.message : 'Unable to submit this report.');
    } finally {
      setReportSaving(false);
    }
  };

  const openEditor = () => {
    if (!post) return;
    setEditTitle(post.title);
    setEditBody(post.body);
    setActionError('');
    setEditOpen(true);
    setPostMenuOpen(false);
  };

  const saveEdit = async () => {
    if (!session || editSaving) return;
    setEditSaving(true);
    setActionError('');
    try {
      const result = await updateRiftboundCommunityPost(postId, { title: editTitle, body: editBody }, session);
      setPost(result.post);
      setEditOpen(false);
    } catch (saveError) {
      setActionError(isRiftboundRateLimitError(saveError) ? '' : saveError instanceof Error ? saveError.message : 'Unable to update this post.');
    } finally {
      setEditSaving(false);
    }
  };

  const deletePost = async () => {
    if (!session || deleteSaving) return;
    setDeleteSaving(true);
    setActionError('');
    try {
      await deleteRiftboundCommunityPost(postId, session);
      router.replace('/riftbound/community');
    } catch (deleteError) {
      setActionError(isRiftboundRateLimitError(deleteError) ? '' : deleteError instanceof Error ? deleteError.message : 'Unable to delete this post.');
      setDeleteSaving(false);
    }
  };

  const sharePost = async () => {
    if (shareBusyRef.current) return;
    shareBusyRef.current = true;
    setShareBusy(true);
    try {
      const url = shareUrl || `${window.location.origin}/riftbound/community/${encodeURIComponent(postId)}`;
      if (navigator.share) await navigator.share({ title: post?.title, text: post?.body || post?.title, url });
      else await navigator.clipboard.writeText(url);
      if (session && !shareCompleted && !hasRiftboundPostBeenShared(postId, session.user.id)) {
        const result = await recordRiftboundPostShare(postId, session);
        markRiftboundPostShared(postId, session.user.id);
        setShareCompleted(true);
        setPost((current) => current ? { ...current, shareCount: result.shareCount } : current);
      }
    } catch {
      // Closing the share sheet is not an error that needs to interrupt reading.
    } finally {
      shareBusyRef.current = false;
      setShareBusy(false);
    }
  };

  const updateReaction = (nextReaction: RiftboundPostReaction) => {
    if (!session) return;
    const previousReaction = localReactionRef.current;
    const nextValue = previousReaction === nextReaction ? null : nextReaction;
    const nextLikeCount = Math.max(0, likeCountRef.current - (previousReaction === 'like' ? 1 : 0) + (nextValue === 'like' ? 1 : 0));
    const nextDislikeCount = Math.max(0, dislikeCountRef.current - (previousReaction === 'dislike' ? 1 : 0) + (nextValue === 'dislike' ? 1 : 0));

    localReactionRef.current = nextValue;
    likeCountRef.current = nextLikeCount;
    dislikeCountRef.current = nextDislikeCount;
    setLocalReaction(nextValue);
    setLikeCount(nextLikeCount);
    setDislikeCount(nextDislikeCount);
    setPost((current) => current ? { ...current, likeCount: nextLikeCount, dislikeCount: nextDislikeCount, viewerReaction: nextValue } : current);

    const request = reactionRequestRef.current
      .catch(() => undefined)
      .then(() => updateRiftboundPostReaction(postId, nextValue, session));
    reactionRequestRef.current = request;
    void request.then((result) => {
      if (localReactionRef.current !== nextValue) return;
      localReactionRef.current = result.reaction;
      likeCountRef.current = result.likeCount;
      dislikeCountRef.current = result.dislikeCount;
      setLocalReaction(result.reaction);
      setLikeCount(result.likeCount);
      setDislikeCount(result.dislikeCount);
      setPost((current) => current ? { ...current, likeCount: result.likeCount, dislikeCount: result.dislikeCount, viewerReaction: result.reaction } : current);
    }).catch(() => {
      if (localReactionRef.current !== nextValue) return;
      localReactionRef.current = previousReaction;
      likeCountRef.current = Math.max(0, nextLikeCount - (nextValue === 'like' ? 1 : 0) + (previousReaction === 'like' ? 1 : 0));
      dislikeCountRef.current = Math.max(0, nextDislikeCount - (nextValue === 'dislike' ? 1 : 0) + (previousReaction === 'dislike' ? 1 : 0));
      setLocalReaction(previousReaction);
      setLikeCount(likeCountRef.current);
      setDislikeCount(dislikeCountRef.current);
      setPost((current) => current ? { ...current, likeCount: likeCountRef.current, dislikeCount: dislikeCountRef.current, viewerReaction: previousReaction } : current);
    });
  };

  if (loading) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto max-w-[1600px] rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading Riftbound post...</div></main>;
  if (error || !post) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto grid max-w-[1600px] gap-4 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error || 'Riftbound post not found.'}</p><Link href="/riftbound/community" className="mx-auto rounded-xl border border-red-200/30 px-4 py-2 text-xs font-black uppercase tracking-[0.1em]">Back to Community</Link></div></main>;
  const isDeckPost = post.postType === 'deck_build' || post.postType === 'deck';
  const isOwner = session?.user.id === post.author.id;

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6">
        <section className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
          <div ref={actionsRef} className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/riftbound/community" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><ArrowLeft size={15} /> Back</Link>
            {session ? <div className="relative"><button type="button" aria-label="Post actions" aria-expanded={postMenuOpen} onClick={() => { setPostMenuOpen((current) => !current); setReportOpen(false); setDeleteConfirmOpen(false); }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200"><Ellipsis size={19} /></button>{postMenuOpen ? <div className="absolute right-0 top-full z-30 mt-2 grid w-52 gap-1 rounded-2xl border border-white/10 bg-slate-950 p-2">{isOwner ? <><button type="button" onClick={openEditor} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-slate-900 hover:text-amber-200"><Pencil size={15} /> Edit Post</button>{deleteConfirmOpen ? <div className="grid gap-2 rounded-xl border border-red-300/20 bg-red-950/10 p-3"><p className="text-xs font-semibold leading-5 text-red-100">Delete this post? This cannot be undone.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setDeleteConfirmOpen(false)} className="rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cancel</button><button type="button" onClick={() => void deletePost()} disabled={deleteSaving} className="rounded-lg border border-red-200/30 bg-red-300/10 px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-red-200 disabled:opacity-50">{deleteSaving ? 'Deleting' : 'Delete'}</button></div></div> : <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-red-200 transition hover:bg-red-300/10"><Trash2 size={15} /> Delete Post</button>}</> : null}<button type="button" onClick={() => { setPostMenuOpen(false); setReportOpen(true); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-slate-900 hover:text-red-200"><ShieldAlert size={15} /> Report</button></div> : null}{reportOpen ? <ReportMenu reason={reportReason} details={reportDetails} saving={reportSaving} onReasonChange={setReportReason} onDetailsChange={setReportDetails} onSubmit={() => void submitReport()} /> : null}</div> : null}
          </div>
          {reportMessage ? <p className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">{reportMessage}</p> : null}
          {actionError ? <p className="rounded-2xl border border-red-300/20 bg-red-950/10 px-4 py-3 text-sm font-semibold text-red-100">{actionError}</p> : null}
          {editOpen ? <section className="grid gap-3 rounded-2xl border border-amber-200/20 bg-slate-900/50 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">Edit Post</p><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Title</span><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={80} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300" /></label><label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Body</span><textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={RIFTBOUND_POST_BODY_MAX_LENGTH} rows={5} className="resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-amber-300" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} disabled={editSaving} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cancel</button><button type="button" onClick={() => void saveEdit()} disabled={editSaving || !editTitle.trim()} className="rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-50">{editSaving ? 'Saving' : 'Save Changes'}</button></div></section> : null}

          <RiftboundCommunityPostHeader post={post} />

          {isDeckPost ? (
            <div className="grid gap-4">
              <div className="border-t border-white/10 pt-4">
                <h2 className="text-xl font-black text-white">{post.snapshotTitle || 'Untitled deck'}</h2>
              </div>
              {compactDeckEntries ? <RiftboundCompactDeckView shareUrl={shareUrl} creatorName={post.author.displayName || post.author.username} creatorNameColor={post.author.chatColor} deckName={post.snapshotTitle || 'Untitled deck'} createdAt={post.createdAt} {...compactDeckEntries} tierRatings={tierRatings} onOpen={setSelectedCard} showHeader={false} className="-mx-5 rounded-none border-x-0 border-b-0 border-t-0 bg-transparent p-0 sm:-mx-6 sm:px-6" /> : null}
            </div>
          ) : groupedCards.length > 0 ? (
            <div className="grid gap-5 border-t border-white/10 pt-5">
              {groupedCards.map(([category, entries]) => <section key={category} className="grid gap-3"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{categoryLabels[category]}</h2><div className="riftbound-card-grid">{entries.map((entry) => { const card = getRiftboundCardById(entry.card_id); return <RiftboundPostCardRow key={`${entry.card_id}:${entry.finish}:${entry.category}`} entry={entry} tierVote={card ? tierRatings[getRiftboundCardTierGroupId(card)]?.tier ?? undefined : undefined} />; })}</div></section>)}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => updateReaction('like')} disabled={!session} aria-label={`Like (${likeCount})`} aria-pressed={localReaction === 'like'} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${localReaction === 'like' ? 'border-amber-200/60 bg-amber-300/15 text-amber-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-amber-200/50 hover:text-amber-200'}`}><ThumbsUp size={15} /> {likeCount}</button>
            <button type="button" onClick={() => updateReaction('dislike')} disabled={!session} aria-label={`Dislike (${dislikeCount})`} aria-pressed={localReaction === 'dislike'} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${localReaction === 'dislike' ? 'border-red-200/60 bg-red-300/15 text-red-200' : 'border-white/10 bg-slate-900 text-slate-400 hover:border-red-200/50 hover:text-red-200'}`}><ThumbsDown size={15} /> {dislikeCount}</button>
            <button type="button" onClick={() => void sharePost()} disabled={shareBusy} className="ml-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50"><Share2 size={15} /> Share</button>
          </div>

          <div id="comments" className="grid gap-4 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2"><MessageCircle size={18} className="text-amber-300" /><h2 className="text-xl font-black text-white">Comments</h2><span className="inline-flex min-w-6 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/10 px-2 py-1 text-xs font-black text-amber-200">{post.commentCount}</span></div>
          {session ? <div className="grid gap-2"><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder="Add a comment" className="resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /><div className="flex justify-end"><button type="button" onClick={() => void addComment()} disabled={commentSaving || !commentBody.trim()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{commentSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Comment</button></div></div> : <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">Sign in to join the conversation.</p>}
          {commentError ? <p className="text-sm font-semibold text-red-200">{commentError}</p> : null}
          {commentsLoading ? <p className="text-sm text-slate-500">Loading comments...</p> : comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : <div className="grid gap-2">{comments.map((comment) => <CommentItem key={comment.id} comment={comment} />)}</div>}
          {commentsCursor ? <button type="button" onClick={() => void loadComments(true)} disabled={commentsMoreLoading} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:opacity-50">{commentsMoreLoading ? <LoaderCircle size={14} className="animate-spin" /> : null} Load More Comments</button> : null}
          </div>
        </section>
        {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={false} showInventoryControls={false} showMarketDetails={false} preferenceSession={session} tierRating={tierRatings[getRiftboundCardTierGroupId(selectedCard)]} onTierChange={(rating) => setTierRatings((current) => { const next = { ...current }; const groupId = getRiftboundCardTierGroupId(selectedCard); if (rating) next[groupId] = rating; else delete next[groupId]; return next; })} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
      </section>
    </main>
  );
}
