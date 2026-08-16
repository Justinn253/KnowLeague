import type { RiftboundDeck } from '@/lib/riftbound-client';
import { getRiftboundCardById, type RiftboundFinish } from '@/lib/riftbound';
import type { RiftboundDeckCategory } from '@/lib/riftbound-decks';
import type { RiftboundBinder } from '@/lib/riftbound-binders';

export type RiftboundShareKind = 'collection' | 'set' | 'master-set' | 'deck' | 'binder';

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

export type RiftboundShareBinder = {
  name: string;
  description: string;
  pages: Array<{
    pageNumber: number;
    name: string;
    slots: Array<{ slotIndex: number; cardId: string; finish: RiftboundFinish }>;
  }>;
};

export type RiftboundShareSnapshot = {
  rows: RiftboundShareInventoryRow[];
  kind: RiftboundShareKind;
  title: string;
  createdBy: string;
  createdAt: string;
  deck?: RiftboundShareDeck;
  binder?: RiftboundShareBinder;
};

export type RiftboundShareMetadata = {
  createdBy: string;
  createdAt: string;
};

export function buildRiftboundCollectionShareSnapshot(
  rows: readonly RiftboundShareInventoryRow[],
  kind: 'collection' | 'set' = 'collection',
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

export function buildRiftboundMasterSetShareSnapshot(
  rows: readonly RiftboundShareInventoryRow[],
  metadata: RiftboundShareMetadata,
): RiftboundShareSnapshot {
  return {
    rows: rows.map((row) => ({ ...row })),
    kind: 'master-set',
    title: 'Master Set',
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

export function buildRiftboundBinderShareSnapshot(binder: RiftboundBinder, metadata: RiftboundShareMetadata): RiftboundShareSnapshot {
  return {
    rows: [],
    kind: 'binder',
    title: binder.name.trim(),
    createdBy: metadata.createdBy.trim(),
    createdAt: metadata.createdAt,
    binder: {
      name: binder.name.trim(),
      description: binder.description.trim(),
      pages: binder.pages.map((page) => ({
        pageNumber: page.page_number,
        name: page.name,
        slots: page.slots.map((slot) => ({ slotIndex: slot.slot_index, cardId: slot.card_id, finish: slot.finish })),
      })),
    },
  };
}
