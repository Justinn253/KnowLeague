import type { RiftboundCard } from '@/lib/riftbound';

export type RiftboundMasterSetCard = Pick<RiftboundCard, 'id' | 'setCode' | 'setName'>;

export type RiftboundMasterSetGroup<TCard extends RiftboundMasterSetCard = RiftboundMasterSetCard> = {
  setCode: string;
  setName: string;
  cards: TCard[];
};

export type RiftboundMasterSetProgress = {
  total: number;
  acquired: number;
  missing: number;
  percent: number;
};

export function isRiftboundMasterSetCatalogueCard(card: Pick<RiftboundCard, 'cardType' | 'rarity' | 'cardTypeLabels' | 'setCode'>) {
  return !(card.cardType === 'Rune' && card.rarity === 'Common' && card.cardTypeLabels.includes('Basic') && card.setCode !== 'OGN');
}

export function buildRiftboundMasterSetInventoryMap(rows: readonly { card_id: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  rows.forEach((row) => quantities.set(row.card_id, (quantities.get(row.card_id) ?? 0) + row.quantity));
  return quantities;
}

export function groupRiftboundCardsBySet<TCard extends RiftboundMasterSetCard>(cards: readonly TCard[]) {
  const groups = new Map<string, RiftboundMasterSetGroup<TCard>>();

  cards.forEach((card) => {
    const current = groups.get(card.setCode);
    if (current) {
      current.cards.push(card);
      return;
    }

    groups.set(card.setCode, {
      setCode: card.setCode,
      setName: card.setName,
      cards: [card],
    });
  });

  return Array.from(groups.values());
}

export function isRiftboundMasterSetCardAcquired(inventoryByCard: ReadonlyMap<string, number>, cardId: string) {
  return (inventoryByCard.get(cardId) ?? 0) > 0;
}

export function getRiftboundMasterSetProgress(
  cards: readonly RiftboundMasterSetCard[],
  inventoryByCard: ReadonlyMap<string, number>,
): RiftboundMasterSetProgress {
  const total = cards.length;
  const acquired = cards.reduce(
    (count, card) => count + (isRiftboundMasterSetCardAcquired(inventoryByCard, card.id) ? 1 : 0),
    0,
  );

  return {
    total,
    acquired,
    missing: total - acquired,
    percent: total === 0 ? 0 : Math.round((acquired / total) * 100),
  };
}
