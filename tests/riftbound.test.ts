import { describe, expect, it } from 'vitest';
import { isRiftboundShowcasePrint, RIFTBOUND_CARDS } from '@/lib/riftbound';

describe('Riftbound showcase classification', () => {
  it('classifies alternate, overnumbered, signature, and SP prints as foil-only Showcase cards', () => {
    expect(isRiftboundShowcasePrint({ collectorNumber: '178A', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: '228', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: '228-STAR', printedTotal: 219 })).toBe(true);
    expect(isRiftboundShowcasePrint({ collectorNumber: 'SP1', printedTotal: 6 })).toBe(true);

    for (const id of ['unl-228-219', 'unl-228-star-219', 'ven-sp1-006']) {
      const card = RIFTBOUND_CARDS.find((candidate) => candidate.id === id);
      expect(card).toMatchObject({ rarity: 'Showcase', finishOptions: ['foil'], defaultFinish: 'foil' });
    }
  });

  it('does not classify ordinary in-range prints as Showcase', () => {
    expect(isRiftboundShowcasePrint({ collectorNumber: '185', printedTotal: 219 })).toBe(false);
    expect(isRiftboundShowcasePrint({ collectorNumber: '001', printedTotal: 298 })).toBe(false);
  });
});
