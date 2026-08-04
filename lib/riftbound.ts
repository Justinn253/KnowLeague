import riftboundCards from '@/data/catalogs/riftbound-cards.json';

export type RiftboundFinish = 'normal' | 'foil';

export const RIFTBOUND_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Overnumbered', 'Signature'] as const;
export type RiftboundCardRarity = typeof RIFTBOUND_RARITY_ORDER[number];

export const RIFTBOUND_CARD_TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type RiftboundCardTier = typeof RIFTBOUND_CARD_TIERS[number];

export type RiftboundCardTierRating = {
  groupId: string;
  tier: RiftboundCardTier | null;
  averageValue: number | null;
  voteCount: number;
  viewerTier: RiftboundCardTier | null;
};

const RIFTBOUND_DOMAIN_TEXT_CLASSES: Record<string, string> = {
  Colorless: 'text-slate-300',
  Body: 'text-orange-300',
  Mind: 'text-blue-300',
  Order: 'text-yellow-200',
  Chaos: 'text-violet-300',
  Calm: 'text-green-500',
  Fury: 'text-red-400',
};

const RIFTBOUND_RARITY_TEXT_CLASSES: Record<string, string> = {
  Common: 'text-slate-300',
  Uncommon: 'text-blue-300',
  Rare: 'text-violet-300',
  Epic: 'text-amber-300',
  Showcase: 'text-yellow-200',
  Overnumbered: 'text-orange-300',
  Signature: 'text-fuchsia-300',
  Token: 'text-cyan-200',
};

export function getRiftboundDomainTextClass(domain: string | undefined) {
  return RIFTBOUND_DOMAIN_TEXT_CLASSES[domain ?? ''] ?? 'text-slate-300';
}

export function getRiftboundCardDomainTextClass(card: Pick<RiftboundCard, 'domains'>) {
  return getRiftboundDomainTextClass(card.domains.find((domain) => domain !== 'Colorless') ?? card.domains[0]);
}

export function getRiftboundRarityTextClass(rarity: string | undefined) {
  return RIFTBOUND_RARITY_TEXT_CLASSES[rarity ?? ''] ?? 'text-slate-300';
}

export function getRiftboundCardRarityTextClass(card: Pick<RiftboundCard, 'rarity'>) {
  return getRiftboundRarityTextClass(card.rarity);
}

export function getRiftboundDeckTypeLabel(card: Pick<RiftboundCard, 'cardType' | 'cardTypeLabels'>) {
  if (card.cardType === 'Unit') return 'Unit';
  if (card.cardType !== 'Spell') return null;
  return card.cardTypeLabels.some((label) => label.toLowerCase().includes('signature')) ? 'Signature Spell' : 'Spell';
}

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

export function mergeRiftboundCardMarketPrices(card: RiftboundCard, latest: RiftboundMarketPrices) {
  // A snapshot can contain a temporary null while TCGPlayer is publishing a
  // new print. Keep the generated catalogue value until a live value arrives
  // so a transient source gap does not turn a known price into N/A.
  const normal = latest.normal ?? card.marketPrices.normal ?? card.marketPrice;
  const foil = latest.foil ?? card.marketPrices.foil;
  const hasLivePrice = latest.normal !== null || latest.foil !== null;
  const updatedAt = hasLivePrice
    ? latest.updatedAt
    : card.marketPrices.updatedAt ?? card.marketPriceUpdatedAt;

  return {
    ...card,
    marketPrice: normal,
    marketPriceUpdatedAt: updatedAt,
    marketPrices: {
      ...card.marketPrices,
      normal,
      foil,
      updatedAt,
    },
  };
}

export function getRiftboundCardTierGroupId(card: Pick<RiftboundCard, 'fullName' | 'productDetails' | 'cardType' | 'cardTypeLabels' | 'energyCost' | 'powerCost' | 'might'>) {
  const identity = [
    card.fullName,
    card.productDetails,
    card.cardType,
    card.cardTypeLabels.join('|'),
    card.energyCost,
    card.powerCost,
    card.might,
  ].map((value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase()).join('|');
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const nameKey = card.fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'card';
  return `content:${(hash >>> 0).toString(16)}:${nameKey}`;
}

export function getRiftboundCardTierFromValue(value: unknown): RiftboundCardTier | null {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0 && numericValue < RIFTBOUND_CARD_TIERS.length
    ? RIFTBOUND_CARD_TIERS[numericValue]
    : null;
}

export function getRiftboundCardTierValue(tier: RiftboundCardTier) {
  return RIFTBOUND_CARD_TIERS.indexOf(tier);
}

export function isRiftboundSignaturePrint(card: Pick<RiftboundCard, 'collectorNumber'>) {
  const collectorNumber = card.collectorNumber.trim().toUpperCase();
  return collectorNumber.endsWith('-STAR') || collectorNumber.endsWith('*');
}

export function isRiftboundOvernumberedPrint(card: Pick<RiftboundCard, 'collectorNumber' | 'printedTotal'>) {
  const collectorNumber = card.collectorNumber.trim().toUpperCase();
  const numericNumber = Number(collectorNumber.match(/^\d+/)?.[0]);
  return Number.isFinite(numericNumber) && card.printedTotal !== null && numericNumber > card.printedTotal;
}

export function isRiftboundShowcasePrint(card: Pick<RiftboundCard, 'collectorNumber' | 'printedTotal'>) {
  const collectorNumber = card.collectorNumber.trim().toUpperCase();
  if (collectorNumber.endsWith('A') || /^SP\d+$/.test(collectorNumber)) return true;
  return isRiftboundSignaturePrint(card) || isRiftboundOvernumberedPrint(card);
}

export function getRiftboundCardRarity(card: Pick<RiftboundCard, 'rarity' | 'collectorNumber' | 'printedTotal'>) {
  if (isRiftboundSignaturePrint(card)) return 'Signature';
  if (isRiftboundOvernumberedPrint(card)) return 'Overnumbered';
  if (card.rarity === 'Showcase' || isRiftboundShowcasePrint(card)) return 'Showcase';
  return card.rarity;
}

export const RIFTBOUND_CARDS = riftboundCards.map((card) => {
  const rarity = getRiftboundCardRarity(card);
  const isFoilOnly = rarity === 'Showcase' || rarity === 'Overnumbered' || rarity === 'Signature';
  return isFoilOnly
    ? { ...card, rarity, finishOptions: ['foil' as RiftboundFinish], defaultFinish: 'foil' as RiftboundFinish }
    : { ...card, rarity };
}) as RiftboundCard[];

const riftboundCardsById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));

export function getRiftboundCardById(cardId: string) {
  return riftboundCardsById.get(cardId) ?? null;
}

export const RIFTBOUND_SET_COUNTS = RIFTBOUND_CARDS.reduce<Record<string, number>>((counts, card) => {
  counts[card.setCode] = (counts[card.setCode] ?? 0) + 1;
  return counts;
}, {});
