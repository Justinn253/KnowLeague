import { describe, expect, it } from 'vitest';
import { getRiftboundCardDetailSetName, getRiftboundCardRarity, getRiftboundCardTierGroupId, isRiftboundOvernumberedPrint, isRiftboundShowcasePrint, isRiftboundSignaturePrint, mergeRiftboundCardMarketPrices, RIFTBOUND_CARDS, RIFTBOUND_RARITY_ORDER } from '@/lib/riftbound';

describe('Riftbound showcase classification', () => {
  it('recognizes alternate, overnumbered, signature, and SP prints as showcase-family variants', () => {
    expect(isRiftboundShowcasePrint({ collectorNumber: '178A', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: '228', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: '228-STAR', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: 'SP1', printedTotal: 6 })).toBe(true);
    expect(isRiftboundOvernumberedPrint({ collectorNumber: '228', printedTotal: 219 })).toBe(true);
    expect(isRiftboundSignaturePrint({ collectorNumber: '228-STAR' })).toBe(true);

    expect(RIFTBOUND_CARDS.find((card) => card.id === 'unl-228-219')).toMatchObject({ rarity: 'Overnumbered', finishOptions: ['foil'], defaultFinish: 'foil' });
    expect(RIFTBOUND_CARDS.find((card) => card.id === 'unl-228-star-219')).toMatchObject({ rarity: 'Signature', finishOptions: ['foil'], defaultFinish: 'foil' });
    expect(RIFTBOUND_CARDS.find((card) => card.id === 'ven-sp1-006')).toMatchObject({ rarity: 'Showcase', finishOptions: ['foil'], defaultFinish: 'foil' });
    expect(RIFTBOUND_CARDS.find((card) => card.id === 'ven-169-166')).toMatchObject({ rarity: 'Overnumbered', finishOptions: ['foil'], defaultFinish: 'foil' });

    const vendettaSignatureIds = RIFTBOUND_CARDS
      .filter((card) => card.setCode === 'VEN' && card.rarity === 'Signature')
      .map((card) => card.id);
    expect(vendettaSignatureIds).toEqual([
      'ven-189-star-166',
      'ven-190-star-166',
      'ven-191-star-166',
      'ven-192-star-166',
      'ven-193-star-166',
      'ven-194-star-166',
      'ven-195-star-166',
      'ven-196-star-166',
      'ven-197-star-166',
    ]);
  });

  it('loads TCGCSV promotional products with stable source identities', () => {
    const promoSetCodes = new Set(['PR', 'OPP', 'JDG']);
    const promoCards = RIFTBOUND_CARDS.filter((card) => promoSetCodes.has(card.setCode));
    expect(promoCards).toHaveLength(209);
    expect(new Set(promoCards.map((card) => card.sourceProductId)).size).toBe(209);
    expect(promoCards.every((card) => card.rarity === 'Promo')).toBe(true);
    expect(RIFTBOUND_CARDS.find((card) => card.id === 'pr-663004')).toMatchObject({
      displayName: 'Buff // Buff (Fist Bump Promo)',
      collectorNumber: 'FIST-BUMP',
      finishOptions: ['foil'],
    });
  });
  it('orders promo rarity between showcase and overnumbered and uses a concise promo detail label', () => {
    expect(RIFTBOUND_RARITY_ORDER).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase', 'Promo', 'Overnumbered', 'Signature']);
    expect(getRiftboundCardDetailSetName({ setName: 'Riftbound Organized Play Promotional Cards', rarity: 'Promo' })).toBe('Promotional Cards');
    expect(getRiftboundCardDetailSetName({ setName: 'Origins', rarity: 'Rare' })).toBe('Origins');

    const promoCards = RIFTBOUND_CARDS.filter((card) => ['PR', 'OPP', 'JDG'].includes(card.setCode));
    expect(promoCards.every((card) => typeof card.imageAvailable === 'boolean')).toBe(true);
  });
  it('classifies rarity variants in descending collector rarity order', () => {
    expect(getRiftboundCardRarity({ rarity: 'Epic', collectorNumber: '169', printedTotal: 166 })).toBe('Overnumbered');
    expect(getRiftboundCardRarity({ rarity: 'Showcase', collectorNumber: '299-STAR', printedTotal: 298 })).toBe('Signature');
    expect(getRiftboundCardRarity({ rarity: 'Epic', collectorNumber: 'SP3', printedTotal: 6 })).toBe('Showcase');
  });

  it('does not classify ordinary in-range prints as Showcase', () => {
    expect(isRiftboundShowcasePrint({ collectorNumber: '185', printedTotal: 219 })).toBe(false);
    expect(isRiftboundShowcasePrint({ collectorNumber: '001', printedTotal: 298 })).toBe(false);
  });

  it('treats an all-null latest snapshot as the current unavailable value', () => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === 'ven-012-166');
    expect(card).toBeTruthy();

    const merged = mergeRiftboundCardMarketPrices(card!, { normal: null, foil: null, updatedAt: '2026-08-03T00:00:00.000Z' });
    expect(merged.marketPrices.normal).toBeNull();
    expect(merged.marketPrices.foil).toBeNull();
    expect(merged.marketPrices.updatedAt).toBe('2026-08-03T00:00:00.000Z');
  });

  it('preserves the catalogue value when a card is absent from the latest snapshot payload', () => {
    const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === 'unl-228-219');
    expect(card).toBeTruthy();

    const merged = mergeRiftboundCardMarketPrices(card!);
    expect(merged.marketPrices.foil).toBe(card!.marketPrices.foil);
    expect(merged.marketPrices.updatedAt).toBe(card!.marketPrices.updatedAt);
  });

  it('includes fallback artwork for Vendetta showcase runes whose source image is pending', () => {
    for (const id of ['ven-r01a', 'ven-r03a', 'ven-r04a', 'ven-r05a', 'ven-r06a']) {
      expect(RIFTBOUND_CARDS.find((card) => card.id === id)?.imageUrl).toMatch(/^https:\/\/openrift\.app\/media\/cards\/.*-400w\.webp$/);
    }
  });

  it('uses one canonical image for regular runes across sets', () => {
    for (const name of ['Fury Rune', 'Calm Rune', 'Mind Rune', 'Body Rune', 'Chaos Rune', 'Order Rune']) {
      const images = new Set(RIFTBOUND_CARDS.filter((card) => card.cardType === 'Rune' && card.rarity === 'Common' && card.displayName === name).map((card) => card.imageUrl));
      expect(images.size).toBe(1);
    }
  });

  it('uses one tier group for identical alternate-art prints', () => {
    const original = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-057-221');
    const alternate = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-057a-221');
    const starPrint = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-225-star-221');
    expect(original && alternate && starPrint).toBeTruthy();
    expect(getRiftboundCardTierGroupId(original!)).toBe(getRiftboundCardTierGroupId(alternate!));
    expect(getRiftboundCardTierGroupId(original!)).toBe(getRiftboundCardTierGroupId(starPrint!));
  });
});
