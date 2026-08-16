import { describe, expect, it } from 'vitest';
import { RIFTBOUND_CARDS } from '@/lib/riftbound';
import {
  RIFTBOUND_DECK_BATTLEFIELD_SIZE,
  RIFTBOUND_DECK_MAIN_SIZE,
  RIFTBOUND_DECK_RUNE_SIZE,
  isRiftboundDeckRuneCatalogueCard,
  sortRiftboundDeckRuneCards,
  validateRiftboundDeck,
  type RiftboundDeckCardSelection,
} from '@/lib/riftbound-decks';

const cardsById = new Map(RIFTBOUND_CARDS.map((card) => [card.id, card]));

function row(cardId: string, category: RiftboundDeckCardSelection['category'], quantity: number): RiftboundDeckCardSelection {
  return { cardId, category, quantity };
}

function validAhriDeck() {
  return {
    name: 'Ahri test deck',
    legendCardId: 'ogn-255-298',
    chosenChampionCardId: 'ogn-066-298',
    cards: [
      row('ogn-255-298', 'legend', 1),
      row('ogn-042-298', 'runes', 6),
      row('ogn-089-298', 'runes', 6),
      row('ogn-275-298', 'battlefields', 1),
      row('ogn-276-298', 'battlefields', 1),
      row('ogn-277-298', 'battlefields', 1),
      row('ogn-066-298', 'main', 1),
      row('ogn-043-298', 'main', 3),
      row('ogn-044-298', 'main', 3),
      row('ogn-045-298', 'main', 3),
      row('ogn-046-298', 'main', 3),
      row('ogn-047-298', 'main', 3),
      row('ogn-048-298', 'main', 3),
      row('ogn-049-298', 'main', 3),
      row('ogn-050-298', 'main', 3),
      row('ogn-051-298', 'main', 3),
      row('ogn-052-298', 'main', 3),
      row('ogn-053-298', 'main', 3),
      row('ogn-054-298', 'main', 3),
      row('ogn-055-298', 'main', 3),
    ],
  };
}

describe('Riftbound game deck validation', () => {
  it('keeps only Origins normal runes and groups rune foil variants alphabetically', () => {
    const runeCards = sortRiftboundDeckRuneCards(RIFTBOUND_CARDS.filter((card) => card.cardType === 'Rune' && isRiftboundDeckRuneCatalogueCard(card)));
    const normalBasicRunes = runeCards.filter((card) => card.cardTypeLabels.includes('Basic') && card.rarity === 'Common' && card.defaultFinish === 'normal');

    expect(normalBasicRunes.every((card) => card.setCode === 'OGN')).toBe(true);
    expect(runeCards.slice(0, 5).map((card) => `${card.displayName}:${card.defaultFinish}`)).toEqual([
      'Body Rune:normal',
      'Body Rune:foil',
      'Body Rune:foil',
      'Body Rune:foil',
      'Body Rune:foil',
    ]);
    expect(runeCards.map((card) => card.displayName).slice(0, 15)).toEqual([
      'Body Rune', 'Body Rune', 'Body Rune', 'Body Rune', 'Body Rune',
      'Calm Rune', 'Calm Rune', 'Calm Rune', 'Calm Rune', 'Calm Rune',
      'Chaos Rune', 'Chaos Rune', 'Chaos Rune', 'Chaos Rune', 'Chaos Rune',
    ]);
  });

  it('accepts a constructed deck with the required categories', () => {
    const draft = validAhriDeck();
    const result = validateRiftboundDeck(draft, cardsById);

    expect(result.isValid).toBe(true);
    expect(result.totals.runes).toBe(RIFTBOUND_DECK_RUNE_SIZE);
    expect(result.totals.battlefields).toBe(RIFTBOUND_DECK_BATTLEFIELD_SIZE);
    expect(result.totals.main).toBe(RIFTBOUND_DECK_MAIN_SIZE);
  });

  it('allows three copies of the same Champion Unit', () => {
    const draft = validAhriDeck();
    draft.cards[6] = row('ogn-066-298', 'main', 3);
    draft.cards[7] = row('ogn-043-298', 'main', 1);

    const result = validateRiftboundDeck(draft, cardsById);

    expect(result.isValid).toBe(true);
  });

  it('rejects cards outside the Legend identity', () => {
    const draft = validAhriDeck();
    draft.cards[1] = row('ogn-007-298', 'runes', 6);

    const result = validateRiftboundDeck(draft, cardsById);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Fury Rune is outside the Legend\'s domain identity.');
  });

  it('rejects repeated Battlefield names and an undersized sideboard', () => {
    const draft = validAhriDeck();
    draft.cards[4] = row('ogn-275-298', 'battlefields', 1);
    draft.cards.push(row('ogn-055-298', 'sideboard', 1));

    const result = validateRiftboundDeck(draft, cardsById);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Battlefields must have unique names.');
    expect(result.errors).toContain('Sideboard must contain either 0 or 8 cards.');
  });

  it('rejects duplicate Battlefield copies and an oversized Main Deck', () => {
    const duplicateBattlefieldDeck = validAhriDeck();
    duplicateBattlefieldDeck.cards[3] = row('ogn-275-298', 'battlefields', 2);

    const battlefieldResult = validateRiftboundDeck(duplicateBattlefieldDeck, cardsById);

    expect(battlefieldResult.isValid).toBe(false);
    expect(battlefieldResult.errors).toContain('Altar to Unity can only have one copy in a deck.');

    const oversizedMainDeck = validAhriDeck();
    oversizedMainDeck.cards[7] = row('ogn-043-298', 'main', 4);

    const mainResult = validateRiftboundDeck(oversizedMainDeck, cardsById);

    expect(mainResult.isValid).toBe(false);
    expect(mainResult.errors).toContain('Main Deck must contain exactly 40 cards.');
  });

  it('rejects Champion Units that do not match the selected Legend', () => {
    const draft = validAhriDeck();
    draft.cards[6] = row('ogn-039-298', 'main', 1);

    const result = validateRiftboundDeck(draft, cardsById);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes("does not match the Legend's Champion tag."))).toBe(true);
  });
});
