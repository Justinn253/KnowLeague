import { describe, expect, it } from 'vitest';
import { getRiftboundCardRarity, getRiftboundCardTierGroupId, isRiftboundOvernumberedPrint, isRiftboundShowcasePrint, isRiftboundSignaturePrint, RIFTBOUND_CARDS } from '@/lib/riftbound';

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

  it('uses one tier group for identical alternate-art prints', () => {
    const original = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-057-221');
    const alternate = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-057a-221');
    const starPrint = RIFTBOUND_CARDS.find((card) => card.id === 'sfd-225-star-221');
    expect(original && alternate && starPrint).toBeTruthy();
    expect(getRiftboundCardTierGroupId(original!)).toBe(getRiftboundCardTierGroupId(alternate!));
    expect(getRiftboundCardTierGroupId(original!)).toBe(getRiftboundCardTierGroupId(starPrint!));
  });
});
