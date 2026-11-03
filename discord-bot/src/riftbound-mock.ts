import { randomInt } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export const RIFTBOUND_MOCK_SETS = [
  { code: 'OGN', name: 'Origins' },
  { code: 'SFD', name: 'Spiritforged' },
  { code: 'UNL', name: 'Unleashed' },
  { code: 'VEN', name: 'Vendetta' },
  { code: 'RAD', name: 'Radiance' },
] as const;

export type RiftboundMockSetCode = typeof RIFTBOUND_MOCK_SETS[number]['code'];
export type RiftboundMockFinish = 'normal' | 'foil';
export type RiftboundMockTreatment = 'standard' | 'alt_art' | 'special_alt' | 'overnumbered' | 'signature' | 'ultimate';
export type RiftboundMockSlot = 'common' | 'uncommon' | 'foil' | 'rare' | 'premium';

type CatalogueCard = {
  cardType: string;
  collectorNumber: string;
  displayName: string;
  finishOptions: RiftboundMockFinish[];
  id: string;
  imageUrl: string;
  marketPrices?: {
    foil?: number | null;
    normal?: number | null;
  };
  printedTotal: number | null;
  rarity: string;
  setCode: string;
};

export type RiftboundMockOpenedCard = {
  card_id: string;
  finish: RiftboundMockFinish;
  slot: RiftboundMockSlot;
  treatment: RiftboundMockTreatment;
};

export type RiftboundMockOpening = {
  cards: RiftboundMockOpenedCard[];
  packsOpened: number;
  setCode: RiftboundMockSetCode;
};

export type RiftboundMockDisplayCard = RiftboundMockOpenedCard & {
  displayName: string;
  imageUrl: string;
  marketPriceUsd: number | null;
  rarity: string;
};

type RandomSource = () => number;

const PACK_CARD_COUNT = 13;
const COMMON_FOIL_WEIGHT = 0.70;
const UNCOMMON_FOIL_WEIGHT = 0.20;
const RARE_FOIL_WEIGHT = 0.08;
const EPIC_BASE_WEIGHT = 1 / 3;
const ALT_ART_RATE = 1 / 12;
const SPECIAL_ALT_RATE = 1 / 12;
const OVERNUMBER_RATE = 1 / 72;
const SIGNATURE_RATE = 1 / 720;
const ULTIMATE_RATE = 1 / 4_000;

let cataloguePromise: Promise<CatalogueCard[]> | null = null;

function isMockSetCode(value: string): value is RiftboundMockSetCode {
  return RIFTBOUND_MOCK_SETS.some((set) => set.code === value);
}

function cardNumber(card: CatalogueCard) {
  const match = card.collectorNumber.match(/^\d+/);
  return match ? Number(match[0]) : null;
}

function isSignature(card: CatalogueCard) {
  return /-STAR$/i.test(card.collectorNumber) || /\*$/i.test(card.collectorNumber);
}

function isOvernumbered(card: CatalogueCard) {
  const number = cardNumber(card);
  return number !== null && card.printedTotal !== null && number > card.printedTotal;
}

function isUltimate(card: CatalogueCard) {
  return (card.setCode === 'UNL' && card.collectorNumber === '238')
    || (card.setCode === 'RAD' && card.collectorNumber === '184');
}

function isSpecialAlt(card: CatalogueCard) {
  return /^SP\d+$/i.test(card.collectorNumber);
}

function isAltArt(card: CatalogueCard) {
  return card.rarity === 'Showcase'
    && /A$/i.test(card.collectorNumber)
    && card.cardType !== 'Rune';
}

async function cataloguePath() {
  const paths = [
    path.resolve(process.cwd(), 'data/catalogs/riftbound-cards.json'),
    path.resolve(process.cwd(), '../data/catalogs/riftbound-cards.json'),
  ];
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // The dev command runs from the repository root while the production
      // container runs from /app/discord-bot; check both intentional paths.
    }
  }
  throw new Error('The Riftbound card catalogue is unavailable to the Discord bot.');
}

async function getCatalogue() {
  if (!cataloguePromise) {
    cataloguePromise = cataloguePath()
      .then((filePath) => readFile(filePath, 'utf8'))
      .then((contents) => JSON.parse(contents) as unknown)
      .then((value) => {
        if (!Array.isArray(value)) throw new Error('The Riftbound card catalogue is invalid.');
        const cards = value.flatMap((entry): CatalogueCard[] => {
          if (!entry || typeof entry !== 'object') return [];
          const card = entry as Partial<CatalogueCard>;
          if (
            typeof card.id !== 'string'
            || typeof card.setCode !== 'string'
            || typeof card.collectorNumber !== 'string'
            || typeof card.displayName !== 'string'
            || typeof card.rarity !== 'string'
            || typeof card.cardType !== 'string'
            || typeof card.imageUrl !== 'string'
            || !Array.isArray(card.finishOptions)
          ) return [];
          return [{
            id: card.id,
            setCode: card.setCode,
            collectorNumber: card.collectorNumber,
            displayName: card.displayName,
            rarity: card.rarity,
            cardType: card.cardType,
            imageUrl: card.imageUrl,
            marketPrices: {
              normal: typeof card.marketPrices?.normal === 'number' ? card.marketPrices.normal : null,
              foil: typeof card.marketPrices?.foil === 'number' ? card.marketPrices.foil : null,
            },
            printedTotal: typeof card.printedTotal === 'number' ? card.printedTotal : null,
            finishOptions: card.finishOptions.filter((finish): finish is RiftboundMockFinish => finish === 'normal' || finish === 'foil'),
          }];
        });
        if (cards.length === 0) throw new Error('The Riftbound card catalogue is empty.');
        return cards;
      });
  }
  return cataloguePromise;
}

function randomValue(random: RandomSource) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Riftbound mock random source returned an invalid value.');
  return value;
}

function chooseOne<T>(items: readonly T[], random: RandomSource) {
  if (items.length === 0) throw new Error('Riftbound mock pack pool is incomplete.');
  return items[Math.floor(randomValue(random) * items.length)]!;
}

function chooseDistinct<T>(items: readonly T[], count: number, random: RandomSource) {
  if (items.length < count) throw new Error('Riftbound mock pack pool is incomplete.');
  const candidates = [...items];
  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const pickIndex = Math.floor(randomValue(random) * candidates.length);
    const [picked] = candidates.splice(pickIndex, 1);
    if (!picked) throw new Error('Riftbound mock pack pool is incomplete.');
    selected.push(picked);
  }
  return selected;
}

function defaultRandom() {
  return randomInt(0, 1_000_000) / 1_000_000;
}

function isTokenLike(card: CatalogueCard) {
  return card.cardType === 'Token' || /^T\d+$/i.test(card.collectorNumber);
}

function isFoilEligible(card: CatalogueCard) {
  return card.finishOptions.includes('foil');
}

function getPool(cards: readonly CatalogueCard[], rarity: string) {
  return cards.filter((card) => card.rarity === rarity && !isTokenLike(card));
}

function makeOpenedCard(card: CatalogueCard, slot: RiftboundMockSlot, treatment: RiftboundMockTreatment = 'standard', forceFoil = false): RiftboundMockOpenedCard {
  if ((forceFoil || treatment !== 'standard') && !isFoilEligible(card)) {
    throw new Error(`Riftbound mock attempted to foil an ineligible card: ${card.id}.`);
  }
  const finish = forceFoil || treatment !== 'standard'
    ? 'foil'
    : (card.finishOptions.includes('normal') ? 'normal' : 'foil');
  return { card_id: card.id, finish, slot, treatment };
}

function chooseFoilCard(pools: Map<string, CatalogueCard[]>, higherRarityAlreadyPulled: boolean, random: RandomSource) {
  const roll = randomValue(random);
  const rarity = roll < COMMON_FOIL_WEIGHT
    ? 'Common'
    : roll < COMMON_FOIL_WEIGHT + UNCOMMON_FOIL_WEIGHT
      ? 'Uncommon'
      : roll < COMMON_FOIL_WEIGHT + UNCOMMON_FOIL_WEIGHT + RARE_FOIL_WEIGHT
        ? 'Rare'
        : 'Epic';
  const eligibleRarity = higherRarityAlreadyPulled && rarity === 'Epic' ? 'Rare' : rarity;
  const foilPool = (pools.get(eligibleRarity) ?? []).filter(isFoilEligible);
  return makeOpenedCard(chooseOne(foilPool, random), 'foil', 'standard', true);
}

function choosePremiumCard(cards: readonly CatalogueCard[], random: RandomSource) {
  const altArts = cards.filter(isAltArt);
  const specialAlts = cards.filter(isSpecialAlt);
  // Some official-gallery snapshots do not list separately numbered signature
  // prints. In that case the corresponding Overnumber is still the correct
  // card artwork and is saved with its distinct Signature treatment.
  const signatures = cards.filter(isSignature);
  const overnumbers = cards.filter((card) => isOvernumbered(card) && !isSignature(card) && !isUltimate(card));
  const ultimate = cards.filter(isUltimate);
  let roll = randomValue(random);

  if (ultimate.length > 0 && roll < ULTIMATE_RATE) {
    return makeOpenedCard(chooseOne(ultimate, random), 'premium', 'ultimate', true);
  }
  roll -= ultimate.length > 0 ? ULTIMATE_RATE : 0;
  const signatureCandidates = signatures.length > 0 ? signatures : overnumbers;
  if (signatureCandidates.length > 0 && roll < SIGNATURE_RATE) {
    return makeOpenedCard(chooseOne(signatureCandidates, random), 'premium', 'signature', true);
  }
  roll -= signatures.length > 0 ? SIGNATURE_RATE : 0;
  // The total Overnumber rate is one in 72; the one-in-720 signature rate is
  // part of that total, leaving nine non-signature appearances in 720 packs.
  const standardOvernumberRate = Math.max(0, OVERNUMBER_RATE - SIGNATURE_RATE);
  if (overnumbers.length > 0 && roll < standardOvernumberRate) {
    return makeOpenedCard(chooseOne(overnumbers, random), 'premium', 'overnumbered', true);
  }
  roll -= overnumbers.length > 0 ? standardOvernumberRate : 0;
  if (specialAlts.length > 0 && roll < SPECIAL_ALT_RATE) {
    return makeOpenedCard(chooseOne(specialAlts, random), 'premium', 'special_alt', true);
  }
  roll -= specialAlts.length > 0 ? SPECIAL_ALT_RATE : 0;
  if (altArts.length > 0 && roll < ALT_ART_RATE) {
    return makeOpenedCard(chooseOne(altArts, random), 'premium', 'alt_art', true);
  }

  return null;
}

/**
 * Resolves the 13 collectible slots the mock system uses for a booster:
 * seven Common, three Uncommon, one foil, and two rare-or-better slots.
 * Token-like and informational inserts are deliberately not mock inventory
 * cards, matching the product scope requested for this system.
 */
export function resolveRiftboundMockPack(cards: readonly CatalogueCard[], random: RandomSource = defaultRandom) {
  const pools = new Map([
    ['Common', getPool(cards, 'Common')],
    ['Uncommon', getPool(cards, 'Uncommon')],
    ['Rare', getPool(cards, 'Rare')],
    ['Epic', getPool(cards, 'Epic')],
  ]);
  const result: RiftboundMockOpenedCard[] = [
    ...chooseDistinct(pools.get('Common') ?? [], 7, random).map((card) => makeOpenedCard(card, 'common')),
    ...chooseDistinct(pools.get('Uncommon') ?? [], 3, random).map((card) => makeOpenedCard(card, 'uncommon')),
  ];

  const premiumCard = choosePremiumCard(cards, random);
  const foilCard = chooseFoilCard(pools, premiumCard !== null, random);
  result.push(foilCard);
  const hasEpicOrHigher = premiumCard !== null || cards.find((card) => card.id === foilCard.card_id)?.rarity === 'Epic';
  const rareSlotCard = makeOpenedCard(
    chooseOne(pools.get(hasEpicOrHigher ? 'Rare' : (randomValue(random) < EPIC_BASE_WEIGHT ? 'Epic' : 'Rare')) ?? [], random),
    'rare',
  );
  result.push(rareSlotCard);

  const hasRareSlotEpic = cards.find((card) => card.id === rareSlotCard.card_id)?.rarity === 'Epic';
  if (premiumCard) {
    result.push(premiumCard);
  } else {
    result.push(makeOpenedCard(
      chooseOne(pools.get(hasRareSlotEpic || hasEpicOrHigher ? 'Rare' : (randomValue(random) < EPIC_BASE_WEIGHT ? 'Epic' : 'Rare')) ?? [], random),
      'premium',
    ));
  }

  if (result.length !== PACK_CARD_COUNT) throw new Error('Riftbound mock pack generation failed.');
  return result;
}

function isEpicOrHigher(card: RiftboundMockOpenedCard, cardsById: ReadonlyMap<string, CatalogueCard>) {
  return card.treatment !== 'standard' || cardsById.get(card.card_id)?.rarity === 'Epic';
}

function guaranteeBoxAltArts(
  openingCards: RiftboundMockOpenedCard[],
  setCards: readonly CatalogueCard[],
  random: RandomSource,
) {
  const altArts = setCards.filter(isAltArt);
  if (altArts.length === 0) throw new Error('Riftbound mock box guarantee has no Alt Art pool.');
  const cardsById = new Map(setCards.map((card) => [card.id, card]));
  const rareCards = getPool(setCards, 'Rare');
  const rareFoilCards = rareCards.filter(isFoilEligible);

  for (let boxStart = 0; boxStart < openingCards.length; boxStart += PACK_CARD_COUNT * 24) {
    const boxEnd = boxStart + (PACK_CARD_COUNT * 24);
    const packs = Array.from({ length: 24 }, (_, index) => openingCards.slice(
      boxStart + (index * PACK_CARD_COUNT),
      boxStart + ((index + 1) * PACK_CARD_COUNT),
    ));
    if (packs.some((pack) => pack.length !== PACK_CARD_COUNT)) {
      throw new Error('Riftbound mock box opening is incomplete.');
    }

    let altArtCount = packs.filter((pack) => pack[PACK_CARD_COUNT - 1]?.treatment === 'alt_art').length;
    for (const pack of packs) {
      if (altArtCount >= 2) break;
      const premiumCard = pack[PACK_CARD_COUNT - 1];
      if (!premiumCard || premiumCard.treatment !== 'standard') continue;

      for (let index = 0; index < PACK_CARD_COUNT - 1; index += 1) {
        const card = pack[index];
        if (!card || !isEpicOrHigher(card, cardsById)) continue;
        const replacementPool = card.slot === 'foil' ? rareFoilCards : rareCards;
        pack[index] = makeOpenedCard(
          chooseOne(replacementPool, random),
          card.slot,
          'standard',
          card.slot === 'foil',
        );
      }

      pack[PACK_CARD_COUNT - 1] = makeOpenedCard(
        chooseOne(altArts, random),
        'premium',
        'alt_art',
        true,
      );
      altArtCount += 1;
    }

    if (altArtCount < 2) {
      throw new Error('Riftbound mock box could not satisfy its Alt Art guarantee.');
    }
    openingCards.splice(boxStart, boxEnd - boxStart, ...packs.flat());
  }
}

export async function openRiftboundMockProducts(
  setCode: RiftboundMockSetCode,
  packsOpened: number,
  random: RandomSource = defaultRandom,
  productKind: 'pack' | 'box' = 'pack',
): Promise<RiftboundMockOpening> {
  if (!Number.isInteger(packsOpened) || packsOpened < 1 || packsOpened > 2_880) {
    throw new Error('Riftbound mock opening amount is invalid.');
  }
  const allCards = await getCatalogue();
  const setCards = allCards.filter((card) => card.setCode === setCode);
  if (setCards.length === 0) throw new Error(`${setCode} is not available in the Riftbound card catalogue.`);
  if (productKind === 'box' && packsOpened % 24 !== 0) {
    throw new Error('Riftbound mock box opening must contain whole boxes.');
  }
  const cards = Array.from({ length: packsOpened }, () => resolveRiftboundMockPack(setCards, random)).flat();
  if (productKind === 'box') guaranteeBoxAltArts(cards, setCards, random);
  return {
    setCode,
    packsOpened,
    cards,
  };
}

export async function getRiftboundMockDisplayCards(openingCards: readonly RiftboundMockOpenedCard[]) {
  const cardsById = new Map((await getCatalogue()).map((card) => [card.id, card]));
  return openingCards.flatMap((openingCard): RiftboundMockDisplayCard[] => {
    const card = cardsById.get(openingCard.card_id);
    return card ? [{
      ...openingCard,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
      marketPriceUsd: card.marketPrices?.[openingCard.finish] ?? null,
      rarity: card.rarity,
    }] : [];
  });
}

export function getRiftboundMockSetName(setCode: RiftboundMockSetCode) {
  return RIFTBOUND_MOCK_SETS.find((set) => set.code === setCode)?.name ?? setCode;
}

export function isRiftboundMockSetCode(value: string): value is RiftboundMockSetCode {
  return isMockSetCode(value);
}

export function isRiftboundMockHighlight(card: RiftboundMockDisplayCard) {
  return card.finish === 'foil' || card.rarity === 'Rare' || card.rarity === 'Epic' || card.treatment !== 'standard';
}

export function formatRiftboundMockTreatment(treatment: RiftboundMockTreatment) {
  return treatment === 'alt_art' ? 'Alt Art'
    : treatment === 'special_alt' ? 'Special Alt'
      : treatment === 'overnumbered' ? 'Overnumbered'
        : treatment === 'signature' ? 'Signature Overnumbered'
          : treatment === 'ultimate' ? 'Ultimate Rare'
            : 'Standard';
}
