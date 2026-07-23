import riftboundCards from '@/data/catalogs/riftbound-cards.json';

export type RiftboundFinish = 'normal' | 'foil';

export type RiftboundCard = {
  id: string;
  displayName: string;
  name: string;
  fullName: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  printedTotal: number | null;
  numberLabel: string;
  rarity: string;
  energyCost: number;
  powerCost: number;
  might: number;
  cardType: string;
  cardTypeLabels: string[];
  tags: string[];
  domains: string[];
  productDetails: string;
  imageUrl: string;
  sourceUrl: string;
  artist: string | null;
  hasErrata: boolean;
  marketPrice: number | null;
  marketPriceUpdatedAt: string | null;
  marketPriceCurrency: string;
  finishOptions: RiftboundFinish[];
  defaultFinish: RiftboundFinish;
};

export const RIFTBOUND_CARDS = riftboundCards as RiftboundCard[];

const riftboundCardsById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));

export function getRiftboundCardById(cardId: string) {
  return riftboundCardsById.get(cardId) ?? null;
}

export const RIFTBOUND_SET_COUNTS = RIFTBOUND_CARDS.reduce<Record<string, number>>((counts, card) => {
  counts[card.setCode] = (counts[card.setCode] ?? 0) + 1;
  return counts;
}, {});
