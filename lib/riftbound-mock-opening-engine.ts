import { randomInt } from 'node:crypto';
import { RIFTBOUND_CARDS, type RiftboundCard } from '@/lib/riftbound';

export const RIFTBOUND_MOCK_SET_CODES = ['OGN', 'SFD', 'UNL', 'VEN', 'RAD'] as const;
export type RiftboundMockSetCode = typeof RIFTBOUND_MOCK_SET_CODES[number];
export type RiftboundMockFinish = 'normal' | 'foil';
export type RiftboundMockTreatment = 'standard' | 'alt_art' | 'special_alt' | 'overnumbered' | 'signature' | 'ultimate';
export type RiftboundMockSlot = 'common' | 'uncommon' | 'foil' | 'rare' | 'premium';

export type RiftboundMockOpeningCard = {
  card_id: string;
  display_name: string;
  finish: RiftboundMockFinish;
  image_url: string | null;
  market_price_usd: number | null;
  rarity: string;
  slot: RiftboundMockSlot;
  treatment: RiftboundMockTreatment;
};

export type RiftboundMockGeneratedOpening = {
  cards: RiftboundMockOpeningCard[];
  packsOpened: number;
  setCode: RiftboundMockSetCode;
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

function randomValue(random: RandomSource) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Riftbound mock random source returned an invalid value.');
  return value;
}

function cryptoRandom() {
  return randomInt(0, 1_000_000) / 1_000_000;
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
    const [picked] = candidates.splice(Math.floor(randomValue(random) * candidates.length), 1);
    if (!picked) throw new Error('Riftbound mock pack pool is incomplete.');
    selected.push(picked);
  }
  return selected;
}

function collectorNumber(card: RiftboundCard) {
  const match = card.collectorNumber.match(/^\d+/);
  return match ? Number(match[0]) : null;
}

function isTokenLike(card: RiftboundCard) {
  return card.cardType === 'Token' || /^T\d+$/i.test(card.collectorNumber);
}

function isFoilEligible(card: RiftboundCard) {
  return card.finishOptions.includes('foil');
}

function isAltArt(card: RiftboundCard) {
  return card.rarity === 'Showcase' && /A$/i.test(card.collectorNumber);
}

function isSpecialAlt(card: RiftboundCard) {
  return /^SP\d+$/i.test(card.collectorNumber);
}

function isSignature(card: RiftboundCard) {
  return /-STAR$/i.test(card.collectorNumber) || /\*$/i.test(card.collectorNumber);
}

function isOvernumbered(card: RiftboundCard) {
  const number = collectorNumber(card);
  return number !== null && card.printedTotal !== null && number > card.printedTotal;
}

function isUltimate(card: RiftboundCard) {
  return (card.setCode === 'UNL' && card.collectorNumber === '238')
    || (card.setCode === 'RAD' && card.collectorNumber === '184');
}

function isAllowedFoilRune(card: RiftboundCard, treatment: RiftboundMockTreatment) {
  return card.cardType !== 'Rune' || (treatment === 'alt_art' && isAltArt(card));
}

function makeOpenedCard(
  card: RiftboundCard,
  slot: RiftboundMockSlot,
  treatment: RiftboundMockTreatment = 'standard',
  forceFoil = false,
): RiftboundMockOpeningCard {
  const isFoil = forceFoil || treatment !== 'standard' || !card.finishOptions.includes('normal');
  if (isFoil && (!isFoilEligible(card) || !isAllowedFoilRune(card, treatment))) {
    throw new Error(`Riftbound mock attempted to foil an ineligible card: ${card.id}.`);
  }
  const finish: RiftboundMockFinish = isFoil ? 'foil' : 'normal';
  return {
    card_id: card.id,
    display_name: card.displayName,
    finish,
    image_url: card.imageUrl || null,
    market_price_usd: card.marketPrices[finish] ?? null,
    rarity: card.rarity,
    slot,
    treatment,
  };
}

function getRarityPool(cards: readonly RiftboundCard[], rarity: string) {
  return cards.filter((card) => card.rarity === rarity && !isTokenLike(card));
}

function choosePremiumCard(cards: readonly RiftboundCard[], random: RandomSource) {
  const altArts = cards.filter(isAltArt);
  const specialAlts = cards.filter((card) => card.cardType !== 'Rune' && isSpecialAlt(card));
  const signatures = cards.filter((card) => card.cardType !== 'Rune' && isSignature(card));
  const overnumbers = cards.filter((card) => card.cardType !== 'Rune' && isOvernumbered(card) && !isSignature(card) && !isUltimate(card));
  const ultimate = cards.filter((card) => card.cardType !== 'Rune' && isUltimate(card));
  let roll = randomValue(random);

  if (ultimate.length > 0 && roll < ULTIMATE_RATE) return makeOpenedCard(chooseOne(ultimate, random), 'premium', 'ultimate', true);
  roll -= ultimate.length > 0 ? ULTIMATE_RATE : 0;
  const signatureCandidates = signatures.length > 0 ? signatures : overnumbers;
  if (signatureCandidates.length > 0 && roll < SIGNATURE_RATE) return makeOpenedCard(chooseOne(signatureCandidates, random), 'premium', 'signature', true);
  roll -= signatures.length > 0 ? SIGNATURE_RATE : 0;
  const standardOvernumberRate = Math.max(0, OVERNUMBER_RATE - SIGNATURE_RATE);
  if (overnumbers.length > 0 && roll < standardOvernumberRate) return makeOpenedCard(chooseOne(overnumbers, random), 'premium', 'overnumbered', true);
  roll -= overnumbers.length > 0 ? standardOvernumberRate : 0;
  if (specialAlts.length > 0 && roll < SPECIAL_ALT_RATE) return makeOpenedCard(chooseOne(specialAlts, random), 'premium', 'special_alt', true);
  roll -= specialAlts.length > 0 ? SPECIAL_ALT_RATE : 0;
  if (altArts.length > 0 && roll < ALT_ART_RATE) return makeOpenedCard(chooseOne(altArts, random), 'premium', 'alt_art', true);
  return null;
}

function isEpicOrHigher(card: RiftboundMockOpeningCard) {
  return card.treatment !== 'standard' || card.rarity === 'Epic';
}

function resolvePack(cards: readonly RiftboundCard[], random: RandomSource) {
  const pools = new Map([
    ['Common', getRarityPool(cards, 'Common')],
    ['Uncommon', getRarityPool(cards, 'Uncommon')],
    ['Rare', getRarityPool(cards, 'Rare')],
    ['Epic', getRarityPool(cards, 'Epic')],
  ]);
  const openingCards: RiftboundMockOpeningCard[] = [
    ...chooseDistinct(pools.get('Common') ?? [], 7, random).map((card) => makeOpenedCard(card, 'common')),
    ...chooseDistinct(pools.get('Uncommon') ?? [], 3, random).map((card) => makeOpenedCard(card, 'uncommon')),
  ];
  const premiumCard = choosePremiumCard(cards, random);
  const foilRarityRoll = randomValue(random);
  const foilRarity = foilRarityRoll < COMMON_FOIL_WEIGHT
    ? 'Common'
    : foilRarityRoll < COMMON_FOIL_WEIGHT + UNCOMMON_FOIL_WEIGHT
      ? 'Uncommon'
      : foilRarityRoll < COMMON_FOIL_WEIGHT + UNCOMMON_FOIL_WEIGHT + RARE_FOIL_WEIGHT
        ? 'Rare'
        : 'Epic';
  const eligibleFoilRarity = premiumCard || foilRarity !== 'Epic' ? (premiumCard && foilRarity === 'Epic' ? 'Rare' : foilRarity) : foilRarity;
  const foilPool = (pools.get(eligibleFoilRarity) ?? []).filter((card) => card.cardType !== 'Rune' && isFoilEligible(card));
  const foilCard = makeOpenedCard(chooseOne(foilPool, random), 'foil', 'standard', true);
  openingCards.push(foilCard);
  const hasEpicOrHigher = premiumCard !== null || foilCard.rarity === 'Epic';
  const rareSlot = makeOpenedCard(chooseOne(pools.get(hasEpicOrHigher ? 'Rare' : (randomValue(random) < EPIC_BASE_WEIGHT ? 'Epic' : 'Rare')) ?? [], random), 'rare');
  openingCards.push(rareSlot);
  if (premiumCard) {
    openingCards.push(premiumCard);
  } else {
    // An Epic foil has already consumed the pack's single Epic-or-higher
    // allowance even when the first rare slot is only a Rare.
    const hasRareSlotEpic = rareSlot.rarity === 'Epic';
    openingCards.push(makeOpenedCard(chooseOne(pools.get(hasRareSlotEpic || hasEpicOrHigher ? 'Rare' : (randomValue(random) < EPIC_BASE_WEIGHT ? 'Epic' : 'Rare')) ?? [], random), 'premium'));
  }
  if (openingCards.length !== PACK_CARD_COUNT) throw new Error('Riftbound mock pack generation failed.');
  return openingCards;
}

function guaranteeBoxAltArts(openingCards: RiftboundMockOpeningCard[], cards: readonly RiftboundCard[], random: RandomSource) {
  const altArts = cards.filter(isAltArt);
  const rareCards = getRarityPool(cards, 'Rare');
  const rareFoils = rareCards.filter(isFoilEligible);
  if (altArts.length === 0 || rareCards.length === 0 || rareFoils.length === 0) throw new Error('Riftbound mock box pool is incomplete.');
  for (let packIndex = 0, altArtCount = openingCards.filter((card, index) => index % PACK_CARD_COUNT === PACK_CARD_COUNT - 1 && card.treatment === 'alt_art').length;
    packIndex < 24 && altArtCount < 2;
    packIndex += 1) {
    const base = packIndex * PACK_CARD_COUNT;
    const premium = openingCards[base + PACK_CARD_COUNT - 1];
    if (!premium || premium.treatment !== 'standard') continue;
    for (let index = 0; index < PACK_CARD_COUNT - 1; index += 1) {
      const card = openingCards[base + index];
      if (!card || !isEpicOrHigher(card)) continue;
      const replacement = card.slot === 'foil' ? chooseOne(rareFoils, random) : chooseOne(rareCards, random);
      openingCards[base + index] = makeOpenedCard(replacement, card.slot, 'standard', card.slot === 'foil');
    }
    openingCards[base + PACK_CARD_COUNT - 1] = makeOpenedCard(chooseOne(altArts, random), 'premium', 'alt_art', true);
    altArtCount += 1;
  }
  const finalAltArts = openingCards.filter((card, index) => index % PACK_CARD_COUNT === PACK_CARD_COUNT - 1 && card.treatment === 'alt_art').length;
  if (finalAltArts < 2) throw new Error('Riftbound mock box could not satisfy its Alt Art guarantee.');
}

export function isRiftboundMockSetCode(value: string): value is RiftboundMockSetCode {
  return (RIFTBOUND_MOCK_SET_CODES as readonly string[]).includes(value);
}

/** Server-authoritative resolver shared with the website mock-opening routes. */
export function generateRiftboundMockOpening(
  setCode: RiftboundMockSetCode,
  openingKind: 'pack' | 'box',
  random: RandomSource = cryptoRandom,
): RiftboundMockGeneratedOpening {
  const setCards = RIFTBOUND_CARDS.filter((card) => card.setCode === setCode);
  if (setCards.length === 0) throw new Error('Riftbound mock set is unavailable.');
  const packsOpened = openingKind === 'box' ? 24 : 1;
  const cards = Array.from({ length: packsOpened }, () => resolvePack(setCards, random)).flat();
  if (openingKind === 'box') guaranteeBoxAltArts(cards, setCards, random);
  return { cards, packsOpened, setCode };
}
