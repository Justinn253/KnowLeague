import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById, RIFTBOUND_CARDS } from '@/lib/riftbound';
import { isRiftboundChampionUnit, RIFTBOUND_DECK_MAX_COUNT, validateRiftboundDeck, type RiftboundDeckCategory, type RiftboundDeckCardSelection } from '@/lib/riftbound-decks';
import { loadRiftboundDecks } from '@/lib/riftbound-server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type DeckRow = {
  id: string;
  name: string;
  description: string;
  legend_card_id: string;
  chosen_champion_card_id: string;
  created_at: string;
  updated_at: string;
};

type DeckCardRow = {
  deck_id: string;
  card_id: string;
  category: RiftboundDeckCategory;
  quantity: number;
};

type DeckBody = {
  deckId?: unknown;
  name?: unknown;
  description?: unknown;
  legendCardId?: unknown;
  chosenChampionCardId?: unknown;
  cards?: unknown;
};

function parseDeckInput(body: DeckBody) {
  const name = requireString(body.name, 'name').trim();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 500) throw new Error('Deck descriptions must be 500 characters or fewer.');
  const legendCardId = requireString(body.legendCardId, 'legendCardId');
  if (!Array.isArray(body.cards) || body.cards.length === 0 || body.cards.length > 1180) {
    throw new Error('A deck must contain at least one card row and no more than 1180 card rows.');
  }

  const cardsByKey = new Map<string, RiftboundDeckCardSelection>();
  body.cards.forEach((rawCard, index) => {
    if (!rawCard || typeof rawCard !== 'object') throw new Error(`Invalid deck card at index ${index}.`);
    const candidate = rawCard as { cardId?: unknown; category?: unknown; quantity?: unknown };
    const cardId = requireString(candidate.cardId, `cards[${index}].cardId`);
    if (!getRiftboundCardById(cardId)) throw new Error('Riftbound card not found.');
    const category = candidate.category;
    if (!['legend', 'runes', 'battlefields', 'main', 'sideboard'].includes(String(category))) {
      throw new Error(`Invalid deck category at index ${index}.`);
    }
    if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 1000) {
      throw new Error(`cards[${index}].quantity must be a whole number between 1 and 1000.`);
    }
    const key = `${category}:${cardId}`;
    if (cardsByKey.has(key)) throw new Error('Deck cards must contain unique category/card rows.');
    cardsByKey.set(key, { cardId, category: category as RiftboundDeckCategory, quantity: candidate.quantity });
  });

  const cards = Array.from(cardsByKey.values());
  const chosenChampionCardId = cards.find((selection) => selection.category === 'main' && isRiftboundChampionUnit(getRiftboundCardById(selection.cardId)!))?.cardId
    ?? (typeof body.chosenChampionCardId === 'string' ? body.chosenChampionCardId : '');
  const validation = validateRiftboundDeck({
    name,
    legendCardId,
    chosenChampionCardId,
    cards,
  }, new Map(RIFTBOUND_CARDS.map((card) => [card.id, card])));
  if (!validation.isValid) throw new Error(validation.errors[0] ?? 'The deck does not follow Riftbound deck-building rules.');
  return { name, description, legendCardId, chosenChampionCardId, cards };
}

function buildDeck(deck: DeckRow, cards: DeckCardRow[]) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    legend_card_id: deck.legend_card_id,
    chosen_champion_card_id: deck.chosen_champion_card_id,
    created_at: deck.created_at,
    updated_at: deck.updated_at,
    cards: cards.filter((card) => card.deck_id === deck.id).map(({ card_id, category, quantity }) => ({ card_id, category, quantity })),
  };
}

function buildCardRows(deckId: string, cards: RiftboundDeckCardSelection[]) {
  return cards.map(({ cardId: card_id, category, quantity }) => ({ deck_id: deckId, card_id, category, quantity }));
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json({ decks: await loadRiftboundDecks(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const input = parseDeckInput(await readJsonBody<DeckBody>(request));
    const existingDecks = await loadRiftboundDecks(userId);
    if (existingDecks.length >= RIFTBOUND_DECK_MAX_COUNT) {
      throw new Error(`You can create up to ${RIFTBOUND_DECK_MAX_COUNT} Riftbound game decks.`);
    }
    const { data, error } = await getSupabaseServiceClient().rpc('create_riftbound_deck', {
      p_user_id: userId,
      p_name: input.name,
      p_description: input.description,
      p_legend_card_id: input.legendCardId,
      p_chosen_champion_card_id: input.chosenChampionCardId,
      p_cards: input.cards.map(({ cardId: card_id, category, quantity }) => ({ card_id, category, quantity })),
    }).returns<DeckRow[]>();
    if (error) throw error;
    const createdDeck = Array.isArray(data) ? data[0] : null;
    if (!createdDeck) throw new Error('Unable to create Riftbound deck.');
    return NextResponse.json({ deck: buildDeck(createdDeck, buildCardRows(createdDeck.id, input.cards)) }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<DeckBody>(request);
    const deckId = requireString(body.deckId, 'deckId');
    const input = parseDeckInput(body);
    const { data, error } = await getSupabaseServiceClient().rpc('update_riftbound_deck', {
      p_user_id: userId,
      p_deck_id: deckId,
      p_name: input.name,
      p_description: input.description,
      p_legend_card_id: input.legendCardId,
      p_chosen_champion_card_id: input.chosenChampionCardId,
      p_cards: input.cards.map(({ cardId: card_id, category, quantity }) => ({ card_id, category, quantity })),
    }).returns<DeckRow[]>();
    if (error) throw error;
    const updatedDeck = Array.isArray(data) ? data[0] : null;
    if (!updatedDeck) throw new Error('Unable to update Riftbound deck.');
    return NextResponse.json({ deck: buildDeck(updatedDeck, buildCardRows(updatedDeck.id, input.cards)) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<{ deckId?: unknown }>(request);
    const deckId = requireString(body.deckId, 'deckId');
    const { data, error } = await getSupabaseServiceClient()
      .from('riftbound_decks')
      .delete()
      .eq('id', deckId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Riftbound deck not found.' }, { status: 404 });
    return NextResponse.json({ deletedDeckId: data.id });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
