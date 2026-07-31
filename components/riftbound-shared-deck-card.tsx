'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Share2 } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import { RiftboundSharedDeckReactions } from '@/components/riftbound-shared-deck-reactions';
import { getChatNameStyle } from '@/lib/chat-colors';
import { getRiftboundCardById } from '@/lib/riftbound';
import { recordRiftboundSharedDeckShare } from '@/lib/riftbound-community-client';
import type { RiftboundSharedDeckSummary } from '@/lib/riftbound-community-types';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

type RiftboundSharedDeckCardProps = {
  deck: RiftboundSharedDeckSummary;
  session: Session | null;
  onDeckChange?: (deck: RiftboundSharedDeckSummary) => void;
};

export function RiftboundSharedDeckCard({ deck, session, onDeckChange }: RiftboundSharedDeckCardProps) {
  const router = useRouter();
  const [shareBusy, setShareBusy] = useState(false);
  const deckHref = `/riftbound/inventory/share?deck=${encodeURIComponent(deck.id)}`;
  const creatorUsername = (deck.createdByUsername || deck.createdBy || 'unknown').replace(/^@/, '').trim() || 'unknown';
  const previewCards = deck.previewCardIds.flatMap((cardId) => {
    const card = getRiftboundCardById(cardId);
    return card ? [card] : [];
  });

  const openDeck = () => router.push(deckHref);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a, button')) return;
    openDeck();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDeck();
    }
  };

  const shareDeck = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const url = `${window.location.origin}${deckHref}`;
      if (navigator.share) await navigator.share({ title: deck.name, text: deck.description || deck.name, url });
      else await navigator.clipboard.writeText(url);
      const response = await recordRiftboundSharedDeckShare(deck.id);
      onDeckChange?.({ ...deck, shareCount: response.shareCount });
    } catch {
      // Closing the native share sheet is not an error for the page.
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <article role="link" tabIndex={0} aria-label={`Open shared deck ${deck.name}`} onClick={handleClick} onKeyDown={handleKeyDown} className="grid cursor-pointer gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 transition hover:border-amber-200/30 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-900 text-base font-black text-amber-200" style={deck.createdByAvatarUrl ? { backgroundImage: `url(${deck.createdByAvatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          {deck.createdByAvatarUrl ? null : creatorUsername.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black text-white sm:text-2xl"><Link href={deckHref} onClick={(event) => event.stopPropagation()} className="hover:text-amber-200">{deck.name}</Link></h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="font-black" style={getChatNameStyle(deck.createdByChatColor)}>@{creatorUsername}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{formatDate(deck.createdAt)}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-amber-200/20 bg-amber-300/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-amber-200">Deck Build</span>
      </div>

      {deck.description ? <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-300">{deck.description}</p> : null}

      {previewCards.length > 0 ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {previewCards.map((card) => <div key={card.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-1 transition hover:border-amber-200/50"><div className="relative aspect-[744/1039] overflow-hidden rounded-xl bg-slate-950"><RiftboundCardImage card={card} sizes="120px" quality={90} loading="lazy" className="object-cover" /></div><p className="mt-1 truncate text-center text-[0.6rem] font-black text-slate-200" title={card.displayName}>{card.displayName}</p><p className="mt-0.5 truncate text-center text-[0.55rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} {card.numberLabel}</p></div>)}
      </div> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <RiftboundSharedDeckReactions deck={deck} session={session} showLabel={false} showSignInHint={false} onDeckChange={onDeckChange} />
        <button type="button" onClick={() => void shareDeck()} disabled={shareBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-400 transition hover:border-amber-200/40 hover:text-amber-200 disabled:cursor-wait disabled:opacity-50"><Share2 size={14} /> {deck.shareCount > 0 ? deck.shareCount : 'Share'}</button>
        {!session ? <span className="ml-auto text-[0.68rem] font-semibold text-slate-600">Sign in to react</span> : null}
      </div>
    </article>
  );
}
