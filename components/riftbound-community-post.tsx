'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArrowLeft, Ellipsis, LoaderCircle, MessageCircle, Pencil, Send, Share2, ShieldAlert, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { RiftboundCompactDeckView, type RiftboundCompactDeckEntry } from '@/components/riftbound-compact-deck-view';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById, getRiftboundCardRarityTextClass, getRiftboundCardTierGroupId, type RiftboundCardTier } from '@/lib/riftbound';
import { isRiftboundChampionUnit } from '@/lib/riftbound-decks';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  createRiftboundComment,
  deleteRiftboundCommunityPost,
  getRiftboundCommunityComments,
  getRiftboundCommunityPost,
  updateRiftboundCommentReaction,
  hasRiftboundPostBeenShared,
  setRiftboundCommunityPostArchiveState,
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

const moderationRoleCache = new Map<string, { role: string | null; expiresAt: number }>();
const moderationRoleRequests = new Map<string, Promise<string | null>>();

function loadRiftboundModerationRole(session: Session) {
  const key = `${session.user.id}:${session.access_token}`;
  const cached = moderationRoleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.role);
  const existing = moderationRoleRequests.get(key);
  if (existing) return existing;
  const request = fetch('/api/moderation/me', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
    .then((response) => response.json() as Promise<{ role?: string }>)
    .then((data) => {
      const role = data.role === 'moderator' || data.role === 'admin' ? data.role : null;
      moderationRoleCache.set(key, { role, expiresAt: Date.now() + 60_000 });
      return role;
    })
    .finally(() => {
      if (moderationRoleRequests.get(key) === request) moderationRoleRequests.delete(key);
    });
  moderationRoleRequests.set(key, request);
  return request;
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-white sm:text-3xl">{post.title}</h1>
            <span className="inline-flex items-center rounded-lg border border-amber-200/25 bg-amber-300/10 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-amber-200">{postTypeLabel(post.postType)}</span>
            {post.visibility === 'archived' ? <span className="inline-flex items-center rounded-lg border border-slate-400/30 bg-slate-500/15 px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-slate-300">Archived</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href={`/riftbound/profile/${encodeURIComponent(post.author.username)}`} className="font-black hover:underline" style={getChatNameStyle(post.author.chatColor)}>{post.author.displayName || post.author.username}</Link>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(post.createdAt)}</span>
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

type RiftboundCommentItemProps = {
  comment: RiftboundCommunityComment;
  subComments: RiftboundCommunityComment[];
  isSubComment: boolean;
  session: Session | null;
  replyTarget: RiftboundCommunityComment | null;
  expanded: boolean;
  hasLoadedReplies: boolean;
  hasMoreReplies: boolean;
  replyingTo: string | null;
  replyBodies: Record<string, string>;
  replyLoadingIds: Set<string>;
  replySaving: boolean;
  highlighted: boolean;
  commentById: ReadonlyMap<string, RiftboundCommunityComment>;
  highlightedCommentId: string | null;
  onCommentRef: (commentId: string, element: HTMLElement | null) => void;
  onToggleReplies: (commentId: string) => void;
  onShowMoreReplies: (commentId: string) => void;
  onStartReply: (commentId: string) => void;
  onReplyBodyChange: (commentId: string, value: string) => void;
  onSubmitReply: (commentId: string) => void;
  onReaction: (comment: RiftboundCommunityComment, reaction: 'like' | 'dislike') => void;
  onJumpToComment: (commentId: string) => void;
};

function CommentItem({
  comment,
  subComments,
  isSubComment,
  session,
  replyTarget,
  expanded,
  hasLoadedReplies,
  hasMoreReplies,
  replyingTo,
  replyBodies,
  replyLoadingIds,
  replySaving,
  highlighted,
  commentById,
  highlightedCommentId,
  onCommentRef,
  onToggleReplies,
  onShowMoreReplies,
  onStartReply,
  onReplyBodyChange,
  onSubmitReply,
  onReaction,
  onJumpToComment,
}: RiftboundCommentItemProps) {
  const content = (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-slate-950 text-xs font-black text-amber-200" style={comment.author.avatarUrl ? { backgroundImage: `url(${comment.author.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {comment.author.avatarUrl ? null : comment.author.displayName.slice(0, 1).toUpperCase()}
        </div>
        <Link href={`/riftbound/profile/${encodeURIComponent(comment.author.username)}`} className="text-sm font-black hover:underline" style={getChatNameStyle(comment.author.chatColor)}>{comment.author.displayName || comment.author.username}</Link>
        <span className="text-xs font-semibold text-slate-600">{formatRelativeTime(comment.createdAt)}</span>
      </div>
      {replyTarget ? <button type="button" onClick={() => onJumpToComment(replyTarget.id)} className="justify-self-start text-xs font-semibold text-slate-500 transition hover:text-amber-200">Replying to <span className="font-black" style={getChatNameStyle(replyTarget.author.chatColor)}>{replyTarget.author.displayName || replyTarget.author.username}</span></button> : null}
      <p className="whitespace-pre-line text-sm leading-6 text-slate-300">{comment.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onReaction(comment, 'like')} disabled={!session} aria-label={`Like comment (${comment.likeCount})`} aria-pressed={comment.viewerReaction === 'like'} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${comment.viewerReaction === 'like' ? 'border-amber-200/60 bg-amber-300/15 text-amber-200' : 'border-white/10 bg-slate-950/60 text-slate-500 hover:border-amber-200/50 hover:text-amber-200'}`}><ThumbsUp size={13} /> {comment.likeCount}</button>
        <button type="button" onClick={() => onReaction(comment, 'dislike')} disabled={!session} aria-label={`Dislike comment (${comment.dislikeCount})`} aria-pressed={comment.viewerReaction === 'dislike'} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${comment.viewerReaction === 'dislike' ? 'border-red-200/60 bg-red-300/15 text-red-200' : 'border-white/10 bg-slate-950/60 text-slate-500 hover:border-red-200/50 hover:text-red-200'}`}><ThumbsDown size={13} /> {comment.dislikeCount}</button>
        {session ? <button type="button" onClick={() => onStartReply(comment.id)} className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs font-black text-slate-500 transition hover:border-amber-200/50 hover:text-amber-200">Reply</button> : null}
        {!isSubComment && comment.replyCount > 0 ? <button type="button" onClick={() => onToggleReplies(comment.id)} className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs font-black text-slate-500 transition hover:border-amber-200/50 hover:text-amber-200">{expanded ? 'Hide Comments' : `View Comments (${comment.replyCount})`}</button> : null}
      </div>
      {replyingTo === comment.id && session ? <div className="grid gap-2 rounded-xl border border-amber-200/15 bg-slate-950/50 p-2"><textarea value={replyBodies[comment.id] ?? ''} onChange={(event) => onReplyBodyChange(comment.id, event.target.value)} maxLength={1000} rows={2} placeholder="Write a reply" className="resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-amber-300" /><div className="flex justify-end gap-2"><button type="button" onClick={() => onStartReply(comment.id)} disabled={replySaving} className="rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-500">Cancel</button><button type="button" onClick={() => onSubmitReply(comment.id)} disabled={replySaving || !(replyBodies[comment.id] ?? '').trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/50 bg-amber-300 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-50">{replySaving ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />} Reply</button></div></div> : null}
    </div>
  );

  if (isSubComment) {
    return <div ref={(element) => onCommentRef(comment.id, element)} data-comment-id={comment.id} className={`border-t border-white/10 pt-3 transition-colors ${highlighted ? 'rounded-xl border-amber-200/80 bg-amber-300/10 px-2 ring-2 ring-amber-300/20' : ''}`}>{content}</div>;
  }

  return (
    <article ref={(element) => onCommentRef(comment.id, element)} data-comment-id={comment.id} className={`grid gap-3 rounded-2xl border bg-slate-900/50 p-3 transition-colors ${highlighted ? 'border-amber-200/80 bg-amber-300/10 ring-2 ring-amber-300/20' : 'border-white/10'}`}>
      {content}
      {expanded ? <div className="grid gap-3 pt-3">
        {subComments.map((subComment) => <CommentItem key={subComment.id} comment={subComment} subComments={[]} isSubComment session={session} replyTarget={subComment.parentId ? commentById.get(subComment.parentId) ?? null : null} expanded={false} hasLoadedReplies={false} hasMoreReplies={false} replyingTo={replyingTo} replyBodies={replyBodies} replyLoadingIds={replyLoadingIds} replySaving={replySaving} highlighted={highlightedCommentId === subComment.id} commentById={commentById} highlightedCommentId={highlightedCommentId} onCommentRef={onCommentRef} onToggleReplies={onToggleReplies} onShowMoreReplies={onShowMoreReplies} onStartReply={onStartReply} onReplyBodyChange={onReplyBodyChange} onSubmitReply={onSubmitReply} onReaction={onReaction} onJumpToComment={onJumpToComment} />)}
        {replyLoadingIds.has(comment.id) && !hasLoadedReplies ? <p className="text-xs font-semibold text-slate-500">Loading comments...</p> : null}
        {hasMoreReplies ? <button type="button" onClick={() => onShowMoreReplies(comment.id)} disabled={replyLoadingIds.has(comment.id)} className="justify-self-start rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200 disabled:opacity-50">{replyLoadingIds.has(comment.id) ? 'Loading' : 'Show More'}</button> : null}
      </div> : null}
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

export function RiftboundCommunityPost({ postId, returnTo }: { postId: string; returnTo?: string }) {
  const router = useRouter();
  const safeReturnTo = returnTo?.startsWith('/riftbound/profile/') ? returnTo : '/riftbound/community';
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [tierRatings, setTierRatings] = useState<Record<string, RiftboundCardTierRating>>({});
  const [post, setPost] = useState<RiftboundCommunityPostDetail | null>(null);
  const [comments, setComments] = useState<RiftboundCommunityComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const commentsCursorRef = useRef<string | null>(null);
  const [repliesByParent, setRepliesByParent] = useState<Record<string, RiftboundCommunityComment[]>>({});
  const [replyCursors, setReplyCursors] = useState<Record<string, string | null>>({});
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [replyLoadingIds, setReplyLoadingIds] = useState<Set<string>>(new Set());
  const [replySaving, setReplySaving] = useState(false);
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
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveAction, setArchiveAction] = useState<'archive' | 'unarchive' | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
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
  const commentElementsRef = useRef(new Map<string, HTMLElement>());
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commentReactionRequestsRef = useRef(new Map<string, Promise<unknown>>());
  const commentReactionStateRef = useRef(new Map<string, { reaction: RiftboundPostReaction | null; likeCount: number; dislikeCount: number }>());

  useEffect(() => subscribeToAuthSession((nextSession) => {
    setSession(nextSession);
    setAuthResolved(true);
  }), []);

  useEffect(() => {
    if (!authResolved) return undefined;
    if (!session) {
      setStaffRole(null);
      return undefined;
    }
    let cancelled = false;
    void loadRiftboundModerationRole(session)
      .then((role) => {
        if (!cancelled) setStaffRole(role);
      })
      .catch(() => { if (!cancelled) setStaffRole(null); });
    return () => { cancelled = true; };
  }, [authResolved, session]);

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
        setArchiveConfirmOpen(false);
        setArchiveAction(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPostMenuOpen(false);
        setReportOpen(false);
        setDeleteConfirmOpen(false);
        setArchiveConfirmOpen(false);
        setArchiveAction(null);
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
    if (!authResolved) return undefined;
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
  }, [authResolved, postId, session]);

  const loadComments = useCallback(async (append = false) => {
    if (!authResolved) return;
    if (append) setCommentsMoreLoading(true);
    else setCommentsLoading(true);
    setCommentError('');
    try {
      const data = await getRiftboundCommunityComments(postId, append ? commentsCursorRef.current : null, session);
      setComments((current) => append ? [...current, ...data.comments] : data.comments);
      if (!append) {
        setRepliesByParent({});
        setReplyCursors({});
        setExpandedCommentIds(new Set());
      }
      commentsCursorRef.current = data.nextCursor;
      setCommentsCursor(data.nextCursor);
    } catch (loadError) {
      setCommentError(isRiftboundRateLimitError(loadError) ? '' : loadError instanceof Error ? loadError.message : 'Unable to load comments.');
    } finally {
      setCommentsLoading(false);
      setCommentsMoreLoading(false);
    }
  }, [authResolved, postId, session]);

  const loadReplies = useCallback(async (commentId: string, append = false) => {
    if (!authResolved || replyLoadingIds.has(commentId)) return;
    setReplyLoadingIds((current) => new Set(current).add(commentId));
    setCommentError('');
    try {
      const data = await getRiftboundCommunityComments(postId, append ? replyCursors[commentId] : null, session, commentId);
      setRepliesByParent((current) => ({ ...current, [commentId]: append ? [...(current[commentId] ?? []), ...data.comments] : data.comments }));
      setReplyCursors((current) => ({ ...current, [commentId]: data.nextCursor }));
    } catch (loadError) {
      setCommentError(isRiftboundRateLimitError(loadError) ? '' : loadError instanceof Error ? loadError.message : 'Unable to load comment replies.');
    } finally {
      setReplyLoadingIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [authResolved, postId, replyCursors, replyLoadingIds, session]);

  const updateCommentState = useCallback((commentId: string, update: (comment: RiftboundCommunityComment) => RiftboundCommunityComment) => {
    setComments((current) => current.map((comment) => comment.id === commentId ? update(comment) : comment));
    setRepliesByParent((current) => Object.fromEntries(Object.entries(current).map(([parentId, rows]) => [parentId, rows.map((comment) => comment.id === commentId ? update(comment) : comment)])));
  }, []);

  const incrementReplyCounts = useCallback((parentId: string) => {
    const loadedComments = new Map<string, RiftboundCommunityComment>();
    comments.forEach((comment) => loadedComments.set(comment.id, comment));
    Object.values(repliesByParent).flat().forEach((comment) => loadedComments.set(comment.id, comment));
    const ancestorIds = new Set<string>();
    let currentId: string | null = parentId;
    while (currentId && !ancestorIds.has(currentId)) {
      ancestorIds.add(currentId);
      currentId = loadedComments.get(currentId)?.parentId ?? null;
    }
    setComments((current) => current.map((comment) => ancestorIds.has(comment.id) ? { ...comment, replyCount: comment.replyCount + 1 } : comment));
    setRepliesByParent((current) => Object.fromEntries(Object.entries(current).map(([commentId, rows]) => [commentId, rows.map((comment) => ancestorIds.has(comment.id) ? { ...comment, replyCount: comment.replyCount + 1 } : comment)])));
  }, [comments, repliesByParent]);

  const toggleCommentReplies = useCallback((commentId: string) => {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    if (!expandedCommentIds.has(commentId) && !(repliesByParent[commentId]?.length)) void loadReplies(commentId);
  }, [expandedCommentIds, loadReplies, repliesByParent]);

  const startCommentReply = useCallback((commentId: string) => {
    setReplyingTo((current) => current === commentId ? null : commentId);
  }, []);

  const submitCommentReply = useCallback(async (parentId: string) => {
    if (!session || replySaving || !(replyBodies[parentId] ?? '').trim()) return;
    setReplySaving(true);
    setCommentError('');
    try {
      const data = await createRiftboundComment(postId, replyBodies[parentId], session, parentId);
      const threadRootId = comments.some((comment) => comment.id === parentId)
        ? parentId
        : Object.entries(repliesByParent).find(([, rows]) => rows.some((comment) => comment.id === parentId))?.[0] ?? null;
      if (threadRootId) {
        setRepliesByParent((current) => ({ ...current, [threadRootId]: [data.comment, ...(current[threadRootId] ?? [])] }));
        setExpandedCommentIds((current) => new Set(current).add(threadRootId));
      }
      incrementReplyCounts(parentId);
      setReplyBodies((current) => ({ ...current, [parentId]: '' }));
      setReplyingTo(null);
      setPost((current) => current ? { ...current, commentCount: current.commentCount + 1 } : current);
    } catch (saveError) {
      setCommentError(isRiftboundRateLimitError(saveError) ? '' : saveError instanceof Error ? saveError.message : 'Unable to add your reply.');
    } finally {
      setReplySaving(false);
    }
  }, [comments, incrementReplyCounts, postId, repliesByParent, replyBodies, replySaving, session]);

  const reactToComment = useCallback((comment: RiftboundCommunityComment, nextReaction: 'like' | 'dislike') => {
    if (!session) return;
    const previous = commentReactionStateRef.current.get(comment.id) ?? {
      reaction: comment.viewerReaction,
      likeCount: comment.likeCount,
      dislikeCount: comment.dislikeCount,
    };
    const reaction = previous.reaction === nextReaction ? null : nextReaction;
    const nextLikeCount = Math.max(0, previous.likeCount - (previous.reaction === 'like' ? 1 : 0) + (reaction === 'like' ? 1 : 0));
    const nextDislikeCount = Math.max(0, previous.dislikeCount - (previous.reaction === 'dislike' ? 1 : 0) + (reaction === 'dislike' ? 1 : 0));
    commentReactionStateRef.current.set(comment.id, { reaction, likeCount: nextLikeCount, dislikeCount: nextDislikeCount });
    updateCommentState(comment.id, (current) => ({ ...current, likeCount: nextLikeCount, dislikeCount: nextDislikeCount, viewerReaction: reaction }));

    const request = (commentReactionRequestsRef.current.get(comment.id) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => updateRiftboundCommentReaction(postId, comment.id, reaction, session));
    commentReactionRequestsRef.current.set(comment.id, request);
    void request.then((result) => {
      const latest = commentReactionStateRef.current.get(comment.id);
      if (!latest || latest.reaction !== reaction) return;
      commentReactionStateRef.current.set(comment.id, { reaction: result.reaction, likeCount: result.likeCount, dislikeCount: result.dislikeCount });
      updateCommentState(comment.id, (current) => ({ ...current, likeCount: result.likeCount, dislikeCount: result.dislikeCount, viewerReaction: result.reaction }));
    }).catch((reactionError) => {
      const latest = commentReactionStateRef.current.get(comment.id);
      if (!latest || latest.reaction !== reaction) return;
      commentReactionStateRef.current.set(comment.id, previous);
      updateCommentState(comment.id, (current) => ({ ...current, likeCount: previous.likeCount, dislikeCount: previous.dislikeCount, viewerReaction: previous.reaction }));
      setCommentError(isRiftboundRateLimitError(reactionError) ? '' : reactionError instanceof Error ? reactionError.message : 'Unable to update the comment reaction.');
    });
  }, [postId, session, updateCommentState]);

  const loadedCommentsById = useMemo(() => {
    const result = new Map<string, RiftboundCommunityComment>();
    comments.forEach((comment) => result.set(comment.id, comment));
    Object.values(repliesByParent).flat().forEach((comment) => result.set(comment.id, comment));
    return result;
  }, [comments, repliesByParent]);

  const commentColumns = useMemo(() => {
    const columns: [RiftboundCommunityComment[], RiftboundCommunityComment[]] = [[], []];
    const estimatedHeights = [0, 0];
    comments.forEach((comment) => {
      const columnIndex = estimatedHeights[0] <= estimatedHeights[1] ? 0 : 1;
      columns[columnIndex].push(comment);
      estimatedHeights[columnIndex] += Math.max(1, Math.ceil(comment.body.length / 80)) + comment.replyCount;
    });
    return columns;
  }, [comments]);

  const jumpToComment = useCallback((commentId: string) => {
    const element = commentElementsRef.current.get(commentId);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedCommentId(commentId);
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedCommentId(null), 1800);
  }, []);

  const renderComment = (comment: RiftboundCommunityComment) => <CommentItem
    key={comment.id}
    comment={comment}
    subComments={repliesByParent[comment.id] ?? []}
    isSubComment={false}
    session={session}
    replyTarget={comment.parentId ? loadedCommentsById.get(comment.parentId) ?? null : null}
    expanded={expandedCommentIds.has(comment.id)}
    hasLoadedReplies={Object.prototype.hasOwnProperty.call(repliesByParent, comment.id)}
    hasMoreReplies={Boolean(replyCursors[comment.id])}
    replyingTo={replyingTo}
    replyBodies={replyBodies}
    replyLoadingIds={replyLoadingIds}
    replySaving={replySaving}
    highlighted={highlightedCommentId === comment.id}
    commentById={loadedCommentsById}
    highlightedCommentId={highlightedCommentId}
    onCommentRef={(commentId, element) => {
      if (element) commentElementsRef.current.set(commentId, element);
      else commentElementsRef.current.delete(commentId);
    }}
    onToggleReplies={toggleCommentReplies}
    onShowMoreReplies={(commentId) => void loadReplies(commentId, true)}
    onStartReply={startCommentReply}
    onReplyBodyChange={(commentId, value) => setReplyBodies((current) => ({ ...current, [commentId]: value }))}
    onSubmitReply={(commentId) => void submitCommentReply(commentId)}
    onReaction={reactToComment}
    onJumpToComment={jumpToComment}
  />;

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

  const changeArchiveState = async (action: 'archive' | 'unarchive') => {
    if (!session || archiveSaving) return;
    setArchiveSaving(true);
    setActionError('');
    try {
      const result = await setRiftboundCommunityPostArchiveState(postId, action, session);
      setPost((current) => current ? { ...current, visibility: result.visibility, archivedByStaff: result.archivedByStaff } : current);
      setArchiveConfirmOpen(false);
      setArchiveAction(null);
      setPostMenuOpen(false);
    } catch (archiveError) {
      setActionError(isRiftboundRateLimitError(archiveError) ? '' : archiveError instanceof Error ? archiveError.message : action === 'archive' ? 'Unable to archive this post.' : 'Unable to unarchive this post.');
    } finally {
      setArchiveSaving(false);
    }
  };

  const sharePost = async () => {
    if (shareBusyRef.current) return;
    shareBusyRef.current = true;
    setShareBusy(true);

    if (session && !shareCompleted && !hasRiftboundPostBeenShared(postId, session.user.id)) {
      const shareSession = session;
      const shareRequest = recordRiftboundPostShare(postId, shareSession);
      void shareRequest.then((result) => {
        markRiftboundPostShared(postId, shareSession.user.id);
        setShareCompleted(true);
        setPost((current) => current ? { ...current, shareCount: result.shareCount } : current);
      }).catch(() => {
        // Share-count failures should not interrupt the sharing flow.
      });
    }

    try {
      const url = shareUrl || `${window.location.origin}/riftbound/community/${encodeURIComponent(postId)}`;
      if (navigator.share) await navigator.share({ title: post?.title, text: post?.body || post?.title, url });
      else await navigator.clipboard.writeText(url);
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
  const isStaff = Boolean(staffRole);
  const archiveActionAllowed = post.visibility === 'archived'
    ? isStaff || (isOwner && !post.archivedByStaff)
    : isStaff || isOwner;

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6">
        <section className="grid gap-5 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
          <div ref={actionsRef} className="flex flex-wrap items-center justify-between gap-3">
            <Link href={safeReturnTo} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><ArrowLeft size={15} /> Back</Link>
            {session ? (
              <div className="relative">
                <button type="button" aria-label="Post actions" aria-expanded={postMenuOpen} onClick={() => { setPostMenuOpen((current) => !current); setReportOpen(false); setDeleteConfirmOpen(false); setArchiveConfirmOpen(false); setArchiveAction(null); }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900 text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200"><Ellipsis size={19} /></button>
                {postMenuOpen ? <div className="absolute right-0 top-full z-30 mt-2 grid w-52 gap-1 rounded-2xl border border-white/10 bg-slate-950 p-2">
                  {isOwner ? <><button type="button" onClick={openEditor} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-slate-900 hover:text-amber-200"><Pencil size={15} /> Edit Post</button>{deleteConfirmOpen ? <div className="grid gap-2 rounded-xl border border-red-300/20 bg-red-950/10 p-3"><p className="text-xs font-semibold leading-5 text-red-100">Delete this post? This cannot be undone.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setDeleteConfirmOpen(false)} className="rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cancel</button><button type="button" onClick={() => void deletePost()} disabled={deleteSaving} className="rounded-lg border border-red-200/30 bg-red-300/10 px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-red-200 disabled:opacity-50">{deleteSaving ? 'Deleting' : 'Delete'}</button></div></div> : <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-red-200 transition hover:bg-red-300/10"><Trash2 size={15} /> Delete Post</button>}</> : null}
                  {archiveActionAllowed ? archiveConfirmOpen ? <div className="grid gap-2 rounded-xl border border-amber-200/20 bg-amber-300/10 p-3"><p className="text-xs font-semibold leading-5 text-amber-100">{archiveAction === 'archive' ? 'Archiving will make this post private.' : 'Unarchiving will restore this post to its previous visibility.'}</p><div className="flex justify-end gap-2"><button type="button" onClick={() => { setArchiveConfirmOpen(false); setArchiveAction(null); }} className="rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-400">Cancel</button><button type="button" onClick={() => void changeArchiveState(archiveAction ?? 'archive')} disabled={archiveSaving} className="rounded-lg border border-amber-200/30 bg-amber-300 px-2 py-1.5 text-xs font-black uppercase tracking-[0.1em] text-slate-950 disabled:opacity-50">{archiveSaving ? archiveAction === 'archive' ? 'Archiving' : 'Unarchiving' : archiveAction === 'archive' ? 'Archive' : 'Unarchive'}</button></div></div> : <button type="button" onClick={() => { const nextAction = post.visibility === 'archived' ? 'unarchive' : 'archive'; setArchiveAction(nextAction); setArchiveConfirmOpen(true); setDeleteConfirmOpen(false); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-amber-200 transition hover:bg-amber-300/10"><Archive size={15} /> {post.visibility === 'archived' ? 'Unarchive Post' : 'Archive Post'}</button> : null}
                  <button type="button" onClick={() => { setPostMenuOpen(false); setReportOpen(true); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:bg-slate-900 hover:text-red-200"><ShieldAlert size={15} /> Report</button>
                </div> : null}
                {reportOpen ? <ReportMenu reason={reportReason} details={reportDetails} saving={reportSaving} onReasonChange={setReportReason} onDetailsChange={setReportDetails} onSubmit={() => void submitReport()} /> : null}
              </div>
            ) : null}
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
            <button type="button" onClick={() => void sharePost()} disabled={shareBusy} className="ml-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/50 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50"><Share2 size={15} /> {post.shareCount}</button>
          </div>

          <div id="comments" className="grid gap-4 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2"><MessageCircle size={18} className="text-amber-300" /><h2 className="text-xl font-black text-white">Comments</h2><span className="inline-flex min-w-6 items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/10 px-2 py-1 text-xs font-black text-amber-200">{post.commentCount}</span></div>
          {session ? <div className="grid gap-2"><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder="Add a comment" className="resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /><div className="flex justify-end"><button type="button" onClick={() => void addComment()} disabled={commentSaving || !commentBody.trim()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{commentSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Comment</button></div></div> : <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">Sign in to join the conversation.</p>}
          {commentError ? <p className="text-sm font-semibold text-red-200">{commentError}</p> : null}
          {commentsLoading ? <p className="text-sm text-slate-500">Loading comments...</p> : comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : <>
            <div className="grid gap-3 lg:hidden">{comments.map(renderComment)}</div>
            <div className="hidden items-start gap-4 lg:grid lg:grid-cols-2"><div className="grid content-start gap-3">{commentColumns[0].map(renderComment)}</div><div className="grid content-start gap-3">{commentColumns[1].map(renderComment)}</div></div>
          </>}
          {commentsCursor ? <button type="button" onClick={() => void loadComments(true)} disabled={commentsMoreLoading} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:opacity-50">{commentsMoreLoading ? <LoaderCircle size={14} className="animate-spin" /> : null} Load More Comments</button> : null}
          </div>
        </section>
        {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={false} showInventoryControls={false} showMarketDetails={false} preferenceSession={session} tierRating={tierRatings[getRiftboundCardTierGroupId(selectedCard)]} onTierChange={(rating) => setTierRatings((current) => { const next = { ...current }; const groupId = getRiftboundCardTierGroupId(selectedCard); if (rating) next[groupId] = rating; else delete next[groupId]; return next; })} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
      </section>
    </main>
  );
}
