import { describe, expect, it } from 'vitest';
import { RIFTBOUND_CARDS } from '../lib/riftbound';
import {
  generateRiftboundMockOpening,
  RIFTBOUND_MOCK_SET_CODES,
} from '../lib/riftbound-mock-opening-engine';

function seededRandom(seed = 17) {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

describe('website Riftbound mock opening resolver', () => {
  it.each(RIFTBOUND_MOCK_SET_CODES)('creates the complete 13-card pack structure for %s', (setCode) => {
    const opening = generateRiftboundMockOpening(setCode, 'pack', seededRandom());
    const slots = opening.cards.reduce<Record<string, number>>((counts, card) => ({
      ...counts,
      [card.slot]: (counts[card.slot] ?? 0) + 1,
    }), {});

    expect(opening.cards).toHaveLength(13);
    expect(slots).toMatchObject({ common: 7, uncommon: 3, foil: 1, rare: 1, premium: 1 });
    expect(opening.cards.every((card) => card.card_id.startsWith(`${setCode.toLowerCase()}-`))).toBe(true);
  });

  it('keeps every generated pack to one Epic-or-higher pull', () => {
    for (const setCode of RIFTBOUND_MOCK_SET_CODES) {
      const opening = generateRiftboundMockOpening(setCode, 'box', seededRandom(setCode.charCodeAt(0)));
      const packs = Array.from({ length: opening.packsOpened }, (_, index) => opening.cards.slice(index * 13, (index + 1) * 13));
      for (const pack of packs) {
        expect(pack.filter((card) => card.rarity === 'Epic' || card.treatment !== 'standard').length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never puts a Rune card in a standard foil slot', () => {
    const runeIds = new Set(RIFTBOUND_CARDS.filter((card) => card.cardType === 'Rune').map((card) => card.id));
    for (const setCode of RIFTBOUND_MOCK_SET_CODES) {
      const opening = generateRiftboundMockOpening(setCode, 'box', seededRandom(setCode.charCodeAt(1)));
      expect(opening.cards.filter((card) => card.slot === 'foil').some((card) => runeIds.has(card.card_id))).toBe(false);
    }
  });

  it.each(RIFTBOUND_MOCK_SET_CODES)('guarantees two Alt Arts in every %s box', (setCode) => {
    const opening = generateRiftboundMockOpening(setCode, 'box', () => 0.999999);
    expect(opening.cards.filter((card) => card.treatment === 'alt_art')).toHaveLength(2);
  });
});
