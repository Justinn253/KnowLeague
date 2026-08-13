import type { RiftboundDeck } from '@/lib/riftbound-client';
import { getRiftboundCardById, type RiftboundFinish } from '@/lib/riftbound';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';

export type RiftboundShareKind = 'collection' | 'set' | 'deck';

export type RiftboundShareInventoryRow = {
  card_id: string;
  finish: RiftboundFinish;
  quantity: number;
};

export type RiftboundShareDeckEntry = {
  card_id: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

export type RiftboundShareDeck = {
  name: string;
  description: string;
  legendCardId: string;
  chosenChampionCardId: string;
  createdAt: string;
  cards: RiftboundShareDeckEntry[];
};

export type RiftboundShareSnapshot = {
  rows: RiftboundShareInventoryRow[];
  kind: RiftboundShareKind;
  title: string;
  createdBy: string;
  createdAt: string;
  deck?: RiftboundShareDeck;
};

export type RiftboundShareMetadata = {
  createdBy: string;
  createdAt: string;
};

export function buildRiftboundCollectionShareSnapshot(
  rows: readonly RiftboundShareInventoryRow[],
  kind: Exclude<RiftboundShareKind, 'deck'> = 'collection',
  title = '',
  metadata: RiftboundShareMetadata,
): RiftboundShareSnapshot {
  return {
    rows: rows.map((row) => ({ ...row })),
    kind,
    title: title.trim(),
    createdBy: metadata.createdBy.trim(),
    createdAt: metadata.createdAt,
  };
}

export function buildRiftboundDeckShareSnapshot(deck: RiftboundDeck, metadata: RiftboundShareMetadata): RiftboundShareSnapshot {
  const cards = deck.cards.map(({ card_id, category, quantity }) => ({ card_id, category, quantity }));
  return {
    rows: cards.map((entry) => ({
      card_id: entry.card_id,
      finish: getRiftboundCardById(entry.card_id)?.defaultFinish ?? 'normal',
      quantity: entry.quantity,
    })),
    kind: 'deck',
    title: deck.name.trim(),
    createdBy: metadata.createdBy.trim(),
    createdAt: metadata.createdAt,
    deck: {
      name: deck.name.trim(),
      description: deck.description?.trim() ?? '',
      legendCardId: deck.legend_card_id,
      chosenChampionCardId: deck.chosen_champion_card_id,
      createdAt: deck.created_at,
      cards,
    },
  };
}
