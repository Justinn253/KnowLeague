import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type SetRow = {
  id: string;
  name: string;
  created_at: string;
};

type SetCardRow = {
  set_id: string;
  card_id: string;
  quantity: number;
};

type SetBody = {
  setId?: unknown;
  name?: unknown;
  cards?: unknown;
};

function parseSetInput(body: Partial<SetBody>) {
  const name = requireString(body.name, 'name').trim();
  if (name.length > 80) throw new Error('Set name must be 80 characters or fewer.');
  if (!Array.isArray(body.cards) || body.cards.length === 0 || body.cards.length > 1180) {
    throw new Error('A set must contain at least one unique card and no more than 1180 unique cards.');
  }

  const cardsById = new Map<string, number>();
  let totalCopies = 0;
  body.cards.forEach((rawCard, index) => {
    if (!rawCard || typeof rawCard !== 'object') throw new Error(`Invalid set card at index ${index}.`);
    const candidate = rawCard as { cardId?: unknown; quantity?: unknown };
    const cardId = requireString(candidate.cardId, `cards[${index}].cardId`);
    if (!getRiftboundCardById(cardId)) throw new Error('Riftbound card not found.');
    if (typeof candidate.quantity !== 'number' || !Number.isInteger(candidate.quantity) || candidate.quantity < 1 || candidate.quantity > 1000) {
      throw new Error(`cards[${index}].quantity must be a whole number between 1 and 1000.`);
    }
    if (cardsById.has(cardId)) throw new Error('Set cards must contain unique card rows.');
    cardsById.set(cardId, candidate.quantity);
    totalCopies += candidate.quantity;
  });

  if (totalCopies > 5000) throw new Error('A set cannot contain more than 5000 total card copies.');
  return { name, cardsById };
}

function buildSet(set: SetRow, cards: SetCardRow[]) {
  return {
    id: set.id,
    name: set.name,
    created_at: set.created_at,
    cards: cards.filter((card) => card.set_id === set.id).map(({ card_id, quantity }) => ({ card_id, quantity })),
  };
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const supabase = getSupabaseServiceClient();
    const { data: setData, error: setError } = await supabase
      .from('riftbound_sets')
      .select('id, name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<SetRow[]>();

    if (setError) throw setError;
    const sets = setData ?? [];
    if (sets.length === 0) return NextResponse.json({ sets: [] });

    const { data: cardData, error: cardError } = await supabase
      .from('riftbound_set_cards')
      .select('set_id, card_id, quantity')
      .in('set_id', sets.map((set) => set.id))
      .returns<SetCardRow[]>();

    if (cardError) throw cardError;
    return NextResponse.json({ sets: sets.map((set) => buildSet(set, cardData ?? [])) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<SetBody>(request);
    const { name, cardsById } = parseSetInput(body);

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.rpc('create_riftbound_set', {
      p_user_id: userId,
      p_name: name,
      p_cards: Array.from(cardsById, ([cardId, quantity]) => ({ card_id: cardId, quantity })),
    }).returns<SetRow[]>();

    if (error) throw error;
    const createdSet = Array.isArray(data) ? data[0] : null;
    if (!createdSet) throw new Error('Unable to create Riftbound set.');

    return NextResponse.json({
      set: buildSet(createdSet, Array.from(cardsById, ([card_id, quantity]) => ({ set_id: createdSet.id, card_id, quantity }))),
    }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<SetBody>(request);
    const setId = requireString(body.setId, 'setId');
    const { name, cardsById } = parseSetInput(body);
    const { data, error } = await getSupabaseServiceClient().rpc('update_riftbound_set', {
      p_user_id: userId,
      p_set_id: setId,
      p_name: name,
      p_cards: Array.from(cardsById, ([cardId, quantity]) => ({ card_id: cardId, quantity })),
    }).returns<SetRow[]>();

    if (error) throw error;
    const updatedSet = Array.isArray(data) ? data[0] : null;
    if (!updatedSet) throw new Error('Unable to update Riftbound set.');

    return NextResponse.json({
      set: buildSet(updatedSet, Array.from(cardsById, ([card_id, quantity]) => ({ set_id: updatedSet.id, card_id, quantity }))),
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
