'use client';

import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { RiftboundCardImage } from '@/components/riftbound-card-image';
import {
  getRiftboundCardRarityTextClass,
  getRiftboundCardTierGroupId,
  type RiftboundCard,
} from '@/lib/riftbound';
import { isRiftboundChampionUnit } from '@/lib/riftbound-decks';
import type { RiftboundCardTierRating } from '@/lib/riftbound-community-types';

export type RiftboundDeckPreviewSource = {
  id: string;
  name: string;
  description: string;
  legend_card_id: string;
  cards: Array<{
    card_id: string;
    category: string;
    quantity: number;
  }>;
};

type RiftboundDeckPreviewProps = {
  deck: RiftboundDeckPreviewSource;
  cardsById: ReadonlyMap<string, RiftboundCard>;
  tierRatings: Record<string, RiftboundCardTierRating>;
  favorite?: boolean;
  owner?: boolean;
  pending?: boolean;
  onFavorite?: () => void;
  favoriteControl?: ReactNode;
  onOpen: () => void;
};

export function getRiftboundDeckPreviewCards(
  deck: RiftboundDeckPreviewSource,
  cardsById: ReadonlyMap<string, RiftboundCard>,
) {
  const previewCardIds: string[] = [];
  const addCard = (cardId: string) => {
    if (previewCardIds.length >= 4 || previewCardIds.includes(cardId)) return;
    if (cardsById.has(cardId)) previewCardIds.push(cardId);
  };

  addCard(deck.legend_card_id);
  deck.cards
    .filter((entry) => entry.category === 'main')
    .forEach((entry) => {
      const card = cardsById.get(entry.card_id);
      if (card && isRiftboundChampionUnit(card)) addCard(card.id);
    });
  deck.cards
    .filter((entry) => entry.category === 'battlefields')
    .forEach((entry) => addCard(entry.card_id));

  return previewCardIds.flatMap((cardId) => {
    const card = cardsById.get(cardId);
    return card ? [card] : [];
  });
}

function DeckFavoriteButton({
  favorite,
  pending,
  onClick,
}: {
  favorite: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:cursor-wait disabled:opacity-80 ${favorite
        ? 'border-amber-200 bg-amber-300 text-slate-950 hover:bg-amber-200'
        : 'border-amber-200/70 bg-slate-700 text-white hover:border-amber-200 hover:bg-amber-300 hover:text-slate-950'}`}
    >
      <Star size={15} className={favorite ? 'fill-current' : ''} />
    </button>
  );
}

export function RiftboundDeckPreview({
  deck,
  cardsById,
  tierRatings,
  favorite = false,
  owner = false,
  pending = false,
  onFavorite,
  favoriteControl,
  onOpen,
}: RiftboundDeckPreviewProps) {
  const previewCards = getRiftboundDeckPreviewCards(deck, cardsById);
  const resolvedFavoriteControl = favoriteControl ?? (owner && onFavorite
    ? <DeckFavoriteButton favorite={favorite} pending={pending} onClick={onFavorite} />
    : favorite
      ? <span title="Favorite deck" aria-label="Favorite deck" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200/50 bg-amber-300/10 text-amber-200"><Star size={15} className="fill-current" /></span>
      : null);

  return (
    <article className="relative grid gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition focus-within:border-amber-200/70 hover:border-amber-200/40">
      <button type="button" onClick={onOpen} className="grid min-w-0 gap-3 text-left focus:outline-none focus:ring-2 focus:ring-amber-200">
        <div className="min-w-0 pr-10">
          <h3 className="truncate text-lg font-black text-white" title={deck.name}>{deck.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400" title={deck.description || 'No description'}>{deck.description || 'No description'}</p>
        </div>
        {previewCards.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {previewCards.map((card) => {
            const tier = tierRatings[getRiftboundCardTierGroupId(card)]?.tier;
            return (
              <div key={card.id} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-center">
                <div className="relative mx-auto aspect-[744/1039] w-full max-w-[6rem] overflow-hidden rounded-lg bg-slate-900"><RiftboundCardImage card={card} sizes="96px" loading="lazy" className="object-cover" /></div>
                <p className={`mt-1 truncate text-center text-[0.65rem] font-black ${getRiftboundCardRarityTextClass(card)}`} title={card.displayName}>{card.displayName}</p>
                <p className="mt-1 truncate text-center text-[0.58rem] font-bold uppercase tracking-[0.08em] text-slate-500">{card.setCode} / {card.numberLabel}{tier ? ` / ${tier}` : ''}</p>
              </div>
            );
          })}
        </div> : null}
      </button>
      {resolvedFavoriteControl ? <div className="absolute right-4 top-4">{resolvedFavoriteControl}</div> : null}
    </article>
  );
}
