import riftboundCards from '@/data/catalogs/riftbound-cards.json';

export type RiftboundFinish = 'normal' | 'foil';

export type RiftboundMarketPrices = {
  normal: number | null;
  foil: number | null;
  updatedAt: string | null;
};

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
  marketPrices: RiftboundMarketPrices;
  finishOptions: RiftboundFinish[];
  defaultFinish: RiftboundFinish;
};

export function isRiftboundShowcasePrint(card: Pick<RiftboundCard, 'collectorNumber' | 'printedTotal'>) {
  const collectorNumber = card.collectorNumber.trim().toUpperCase();
  if (collectorNumber.endsWith('A') || collectorNumber.endsWith('-STAR') || /^SP\d+$/.test(collectorNumber)) return true;

  const numericNumber = Number(collectorNumber.match(/^\d+/)?.[0]);
  return Number.isFinite(numericNumber) && card.printedTotal !== null && numericNumber > card.printedTotal;
}

export const RIFTBOUND_CARDS = riftboundCards.map((card) => {
  const isShowcase = card.rarity === 'Showcase' || isRiftboundShowcasePrint(card);
  return isShowcase
    ? { ...card, rarity: 'Showcase', finishOptions: ['foil' as RiftboundFinish], defaultFinish: 'foil' as RiftboundFinish }
    : card;
}) as RiftboundCard[];

const riftboundCardsById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));

export function getRiftboundCardById(cardId: string) {
  return riftboundCardsById.get(cardId) ?? null;
}

export const RIFTBOUND_SET_COUNTS = RIFTBOUND_CARDS.reduce<Record<string, number>>((counts, card) => {
  counts[card.setCode] = (counts[card.setCode] ?? 0) + 1;
  return counts;
}, {});
