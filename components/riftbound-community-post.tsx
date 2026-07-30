'use client';

import Link from 'next/link';
import { ArrowLeft, LoaderCircle, MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardDetailsModal } from '@/components/riftbound-card-grid';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { RiftboundCompactDeckView, type RiftboundCompactDeckEntry } from '@/components/riftbound-compact-deck-view';
import { subscribeToAuthSession } from '@/lib/auth-session-client';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById } from '@/lib/riftbound';
import { isRiftboundChampionUnit } from '@/lib/riftbound-decks';
import {
  createRiftboundComment,
  getRiftboundCommunityComments,
  getRiftboundCommunityPost,
  reportRiftboundContent,
} from '@/lib/riftbound-community-client';
import type { RiftboundCommunityComment, RiftboundCommunityPostDetail, RiftboundPostSnapshotCard } from '@/lib/riftbound-community-types';

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
            <span className="font-black uppercase tracking-[0.1em] text-amber-200">{postTypeLabel(post.postType)}</span>
          </div>
        </div>
      </div>
      {post.body ? <p className="whitespace-pre-line text-sm leading-6 text-slate-300">{post.body}</p> : null}
    </div>
  );
}

function RiftboundPostCardRow({ entry }: { entry: RiftboundPostSnapshotCard }) {
  const card = getRiftboundCardById(entry.card_id);
  if (!card) return null;
  return (
    <article className="riftbound-card-item min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="relative aspect-[744/1039] overflow-hidden rounded-xl bg-slate-900"><RiftboundCardImage card={card} sizes="220px" loading="lazy" className="object-cover" /></div>
      <p className="mt-2 truncate text-sm font-black text-white" title={card.displayName}>{card.displayName}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{card.setCode} · {card.numberLabel}</p>
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

export function RiftboundCommunityPost({ postId }: { postId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [post, setPost] = useState<RiftboundCommunityPostDetail | null>(null);
  const [comments, setComments] = useState<RiftboundCommunityComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const commentsCursorRef = useRef<string | null>(null);
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
  const [selectedCard, setSelectedCard] = useState<import('@/lib/riftbound').RiftboundCard | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => subscribeToAuthSession((nextSession) => setSession(nextSession)), []);

  useEffect(() => {
    if (typeof window !== 'undefined') setShareUrl(`${window.location.origin}/riftbound/community/${encodeURIComponent(postId)}`);
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getRiftboundCommunityPost(postId, session)
      .then((data) => { if (!cancelled) setPost(data.post); })
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
      setCommentError(loadError instanceof Error ? loadError.message : 'Unable to load comments.');
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
      setCommentError(saveError instanceof Error ? saveError.message : 'Unable to add your comment.');
    } finally {
      setCommentSaving(false);
    }
  };

  const submitReport = async () => {
    if (!session || reportSaving) return;
    setReportSaving(true);
    setReportMessage('');
    try {
      await reportRiftboundContent({ postId, reason: reportReason, details: reportDetails }, session);
      setReportMessage('Report submitted. Thank you.');
      setReportOpen(false);
      setReportDetails('');
    } catch (reportError) {
      setReportMessage(reportError instanceof Error ? reportError.message : 'Unable to submit this report.');
    } finally {
      setReportSaving(false);
    }
  };

  if (loading) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto max-w-[1600px] rounded-3xl border border-white/10 bg-slate-950/80 px-6 py-16 text-center text-sm font-semibold text-slate-400">Loading Riftbound post...</div></main>;
  if (error || !post) return <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100"><div className="mx-auto grid max-w-[1600px] gap-4 rounded-3xl border border-red-300/20 bg-red-950/20 px-6 py-16 text-center text-sm font-semibold text-red-200"><p>{error || 'Riftbound post not found.'}</p><Link href="/riftbound/community" className="mx-auto rounded-xl border border-red-200/30 px-4 py-2 text-xs font-black uppercase tracking-[0.1em]">Back to Community</Link></div></main>;
  const isDeckPost = post.postType === 'deck_build' || post.postType === 'deck';

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-10">
      <section className="mx-auto grid w-full max-w-[1600px] gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/riftbound/community" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200"><ArrowLeft size={15} /> Community</Link>
          <div className="flex flex-wrap gap-2"><Link href={`/riftbound/profile/${encodeURIComponent(post.author.username)}`} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200">View Profile</Link>{session ? <button type="button" onClick={() => setReportOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-400 transition hover:border-red-200/50 hover:text-red-200"><ShieldAlert size={14} /> Report</button> : null}</div>
        </div>

        {reportOpen ? <section className="grid gap-3 rounded-3xl border border-red-300/20 bg-red-950/10 p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-red-200">Report post</p><select value={reportReason} onChange={(event) => setReportReason(event.target.value as (typeof reportOptions)[number]['value'])} className="h-11 rounded-xl border border-red-200/20 bg-slate-950 px-3 text-sm font-semibold text-white outline-none focus:border-red-200"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate">Hate or abuse</option><option value="misinformation">Misinformation</option><option value="other">Other</option></select><textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={500} rows={3} placeholder="Optional details" className="resize-y rounded-xl border border-red-200/20 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-200" /><div className="flex justify-end"><button type="button" onClick={() => void submitReport()} disabled={reportSaving} className="inline-flex items-center gap-2 rounded-xl border border-red-200/30 bg-red-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-red-200 disabled:opacity-50">{reportSaving ? <LoaderCircle size={14} className="animate-spin" /> : null} Submit Report</button></div></section> : null}
        {reportMessage ? <p className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">{reportMessage}</p> : null}

        {isDeckPost ? (
          <section className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6">
            <RiftboundCommunityPostHeader post={post} />
            {compactDeckEntries ? <RiftboundCompactDeckView shareUrl={shareUrl} creatorName={post.author.displayName || post.author.username} deckName={post.snapshotTitle || post.title} createdAt={post.createdAt} {...compactDeckEntries} onOpen={setSelectedCard} showHeader={false} className="-mx-5 rounded-none border-x-0 border-b-0 border-t border-white/10 bg-transparent p-0 pt-5 sm:-mx-6 sm:px-6 sm:pt-6" /> : null}
          </section>
        ) : groupedCards.length > 0 ? (
          <>
            <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6"><RiftboundCommunityPostHeader post={post} /></section>
            <section className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-6">
            {groupedCards.map(([category, entries]) => <section key={category} className="grid gap-3"><h2 className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">{categoryLabels[category]}</h2><div className="riftbound-card-grid">{entries.map((entry) => <RiftboundPostCardRow key={`${entry.card_id}:${entry.finish}:${entry.category}`} entry={entry} />)}</div></section>)}
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-6"><RiftboundCommunityPostHeader post={post} /></section>
        )}

        <section id="comments" className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-6">
          <div className="flex items-center gap-2"><MessageCircle size={18} className="text-amber-300" /><h2 className="text-xl font-black text-white">Comments</h2><span className="text-sm font-bold text-slate-500">{post.commentCount}</span></div>
          {session ? <div className="grid gap-2"><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder="Add a comment" className="resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20" /><div className="flex justify-end"><button type="button" onClick={() => void addComment()} disabled={commentSaving || !commentBody.trim()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-amber-300 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{commentSaving ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Comment</button></div></div> : <p className="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">Sign in to join the conversation.</p>}
          {commentError ? <p className="text-sm font-semibold text-red-200">{commentError}</p> : null}
          {commentsLoading ? <p className="text-sm text-slate-500">Loading comments...</p> : comments.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : <div className="grid gap-2">{comments.map((comment) => <CommentItem key={comment.id} comment={comment} />)}</div>}
          {commentsCursor ? <button type="button" onClick={() => void loadComments(true)} disabled={commentsMoreLoading} className="mx-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-300 transition hover:border-amber-200/50 hover:text-amber-200 disabled:opacity-50">{commentsMoreLoading ? <LoaderCircle size={14} className="animate-spin" /> : null} Load More Comments</button> : null}
        </section>
        {selectedCard ? <RiftboundCardDetailsModal card={selectedCard} normalQuantity={0} foilQuantity={0} latestSnapshotDate={null} pending={false} showInventoryControls={false} showMarketDetails={false} preferenceSession={session} onClose={() => setSelectedCard(null)} onAdjust={() => undefined} /> : null}
      </section>
    </main>
  );
}
