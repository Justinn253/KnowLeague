import type { RiftboundCard } from '@/lib/riftbound';

export type RiftboundDeckCategory = 'legend' | 'runes' | 'battlefields' | 'main' | 'sideboard';

export type RiftboundDeckCardSelection = {
  cardId: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

export type RiftboundDeckDraft = {
  name: string;
  legendCardId: string | null;
  chosenChampionCardId: string | null;
  cards: RiftboundDeckCardSelection[];
};

export type RiftboundDeckCategoryTotals = Record<RiftboundDeckCategory, number>;

export type RiftboundDeckValidation = {
  isValid: boolean;
  errors: string[];
  totals: RiftboundDeckCategoryTotals;
};

export const RIFTBOUND_DECK_MAIN_SIZE = 40;
export const RIFTBOUND_DECK_RUNE_SIZE = 12;
export const RIFTBOUND_DECK_BATTLEFIELD_SIZE = 3;
export const RIFTBOUND_DECK_SIDEBOARD_SIZE = 8;
export const RIFTBOUND_DECK_MAX_COPIES = 3;
export const RIFTBOUND_DECK_MAX_SIGNATURES = 3;
export const RIFTBOUND_DECK_MAX_CHAMPION_UNITS = 3;
export const RIFTBOUND_DECK_MAX_COUNT = 6;

export const RIFTBOUND_DECK_CATEGORY_ORDER: RiftboundDeckCategory[] = [
  'legend',
  'runes',
  'battlefields',
  'main',
  'sideboard',
];

export const RIFTBOUND_DECK_CATEGORY_LABELS: Record<RiftboundDeckCategory, string> = {
  legend: 'Legend',
  runes: 'Rune Deck',
  battlefields: 'Battlefields',
  main: 'Main Deck',
  sideboard: 'Sideboard',
};

export function getRiftboundDeckCardCategory(card: RiftboundCard): Exclude<RiftboundDeckCategory, 'sideboard'> | null {
  if (card.cardType === 'Legend') return 'legend';
  if (card.cardType === 'Rune') return 'runes';
  if (card.cardType === 'Battlefield') return 'battlefields';
  if (card.cardType === 'Unit' || card.cardType === 'Spell' || card.cardType === 'Gear') return 'main';
  return null;
}

export function isRiftboundDeckRuneCatalogueCard(card: RiftboundCard) {
  const isNormalBasicRune = card.cardType === 'Rune'
    && card.rarity === 'Common'
    && card.cardTypeLabels.includes('Basic')
    && card.defaultFinish === 'normal';
  return !isNormalBasicRune || card.setCode === 'OGN';
}

export function sortRiftboundDeckRuneCards(cards: readonly RiftboundCard[]) {
  return cards.slice().sort((left, right) => (
    left.displayName.localeCompare(right.displayName)
    || Number(left.defaultFinish === 'foil') - Number(right.defaultFinish === 'foil')
    || left.setCode.localeCompare(right.setCode)
    || left.collectorNumber.localeCompare(right.collectorNumber, undefined, { numeric: true })
    || left.id.localeCompare(right.id)
  ));
}

export function isRiftboundChampionUnit(card: RiftboundCard) {
  return card.cardType === 'Unit' && card.cardTypeLabels.includes('Champion');
}

export function isRiftboundCardInLegendIdentity(card: RiftboundCard, legend: RiftboundCard | null) {
  if (!legend) return false;
  const cardDomains = card.domains.filter((domain) => domain !== 'Colorless');
  if (cardDomains.length === 0) return true;
  return cardDomains.every((domain) => legend.domains.includes(domain));
}

export function hasMatchingRiftboundChampionTag(card: RiftboundCard, legend: RiftboundCard | null) {
  if (!legend) return false;
  return card.tags.some((tag) => legend.tags.includes(tag));
}

export function getRiftboundDeckCardName(card: RiftboundCard) {
  return card.displayName;
}

function getEmptyTotals(): RiftboundDeckCategoryTotals {
  return {
    legend: 0,
    runes: 0,
    battlefields: 0,
    main: 0,
    sideboard: 0,
  };
}

export function getRiftboundDeckTotals(cards: RiftboundDeckCardSelection[]): RiftboundDeckCategoryTotals {
  return cards.reduce((totals, card) => {
    totals[card.category] += card.quantity;
    return totals;
  }, getEmptyTotals());
}

export function validateRiftboundDeck(
  draft: RiftboundDeckDraft,
  cardsById: ReadonlyMap<string, RiftboundCard>,
): RiftboundDeckValidation {
  const errors: string[] = [];
  const totals = getRiftboundDeckTotals(draft.cards);
  const selectedCards = draft.cards.flatMap((selection) => {
    const card = cardsById.get(selection.cardId);
    return card ? [{ ...selection, card }] : [];
  });
  const legendSelection = selectedCards.filter((selection) => selection.category === 'legend');
  const legend = draft.legendCardId ? cardsById.get(draft.legendCardId) ?? null : null;

  if (!draft.name.trim()) errors.push('Enter a deck name.');
  if (draft.name.trim().length > 80) errors.push('Deck names must be 80 characters or fewer.');

  if (totals.legend !== 1 || legendSelection.length !== 1 || !legend || legendSelection[0]?.cardId !== draft.legendCardId || legendSelection[0]?.quantity !== 1) {
    errors.push('Choose exactly 1 Legend.');
  } else if (getRiftboundDeckCardCategory(legend) !== 'legend') {
    errors.push('The selected Legend is not a valid Legend card.');
  }

  if (totals.runes !== RIFTBOUND_DECK_RUNE_SIZE) {
    errors.push(`Rune Deck must contain exactly ${RIFTBOUND_DECK_RUNE_SIZE} cards.`);
  }

  if (totals.battlefields !== RIFTBOUND_DECK_BATTLEFIELD_SIZE) {
    errors.push(`Choose exactly ${RIFTBOUND_DECK_BATTLEFIELD_SIZE} Battlefields.`);
  }

  const battlefieldNames = new Set<string>();
  selectedCards.filter((selection) => selection.category === 'battlefields').forEach((selection) => {
    if (selection.quantity !== 1) {
      errors.push(`${getRiftboundDeckCardName(selection.card)} can only have one copy in a deck.`);
    }
    if (battlefieldNames.has(getRiftboundDeckCardName(selection.card))) {
      errors.push('Battlefields must have unique names.');
    }
    battlefieldNames.add(getRiftboundDeckCardName(selection.card));
  });

  if (totals.main !== RIFTBOUND_DECK_MAIN_SIZE) {
    errors.push(`Main Deck must contain exactly ${RIFTBOUND_DECK_MAIN_SIZE} cards.`);
  }

  if (totals.sideboard !== 0 && totals.sideboard !== RIFTBOUND_DECK_SIDEBOARD_SIZE) {
    errors.push(`Sideboard must contain either 0 or ${RIFTBOUND_DECK_SIDEBOARD_SIZE} cards.`);
  }

  const championSelections = selectedCards.filter((selection) => (selection.category === 'main' || selection.category === 'sideboard') && isRiftboundChampionUnit(selection.card));
  const mainChampionSelections = championSelections.filter((selection) => selection.category === 'main');
  if (mainChampionSelections.length === 0) {
    errors.push('Add at least one Champion Unit to the Main Deck.');
  }
  const championCopies = championSelections.reduce((total, selection) => total + selection.quantity, 0);
  if (championCopies > RIFTBOUND_DECK_MAX_CHAMPION_UNITS) {
    errors.push(`A deck may contain no more than ${RIFTBOUND_DECK_MAX_CHAMPION_UNITS} Champion Unit copies.`);
  }
  championSelections.forEach((selection) => {
    if (!hasMatchingRiftboundChampionTag(selection.card, legend)) {
      errors.push(`${selection.card.displayName} does not match the Legend's Champion tag.`);
    }
  });

  selectedCards.forEach((selection) => {
    const expectedCategory = getRiftboundDeckCardCategory(selection.card);
    const isMainOrSideboard = selection.category === 'main' || selection.category === 'sideboard';
    const categoryIsValid = selection.category === 'sideboard'
      ? expectedCategory === 'main'
      : expectedCategory === selection.category;

    if (!categoryIsValid) {
      errors.push(`${selection.card.displayName} is in the wrong deck category.`);
      return;
    }

    if (isMainOrSideboard && !isRiftboundCardInLegendIdentity(selection.card, legend)) {
      errors.push(`${selection.card.displayName} is outside the Legend's domain identity.`);
    }

    if (selection.category === 'runes' && !isRiftboundCardInLegendIdentity(selection.card, legend)) {
      errors.push(`${selection.card.displayName} is outside the Legend's domain identity.`);
    }

    if (isMainOrSideboard && selection.card.cardTypeLabels.includes('Signature') && !hasMatchingRiftboundChampionTag(selection.card, legend)) {
      errors.push(`${selection.card.displayName} does not match the Legend's Champion tag.`);
    }
  });

  const namedCardTotals = new Map<string, number>();
  selectedCards
    .filter((selection) => selection.category === 'main' || selection.category === 'sideboard')
    .forEach((selection) => {
      const name = getRiftboundDeckCardName(selection.card);
      namedCardTotals.set(name, (namedCardTotals.get(name) ?? 0) + selection.quantity);
    });
  namedCardTotals.forEach((quantity, name) => {
    if (quantity > RIFTBOUND_DECK_MAX_COPIES) {
      errors.push(`${name} has more than ${RIFTBOUND_DECK_MAX_COPIES} copies across the Main Deck and Sideboard.`);
    }
  });

  const signatureCount = selectedCards
    .filter((selection) => (selection.category === 'main' || selection.category === 'sideboard') && selection.card.cardTypeLabels.includes('Signature'))
    .reduce((total, selection) => total + selection.quantity, 0);
  if (signatureCount > RIFTBOUND_DECK_MAX_SIGNATURES) {
    errors.push(`A deck may contain no more than ${RIFTBOUND_DECK_MAX_SIGNATURES} Signature cards.`);
  }

  return {
    isValid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    totals,
  };
}
