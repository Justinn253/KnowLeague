import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type InventoryRow = {
  card_id: string;
  finish: 'normal' | 'foil';
  quantity: number;
  updated_at: string;
};

type InventoryBody = {
  cardId: string;
  finish: 'normal' | 'foil';
  delta: number;
};

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { data, error } = await getSupabaseServiceClient()
      .from('riftbound_inventory')
      .select('card_id, finish, quantity, updated_at')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .order('updated_at', { ascending: false })
      .returns<InventoryRow[]>();

    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<InventoryBody>(request);
    const cardId = requireString(body.cardId, 'cardId');
    const card = getRiftboundCardById(cardId);
    if (!card) throw new Error('Riftbound card not found.');

    const finish = body.finish ?? card.defaultFinish;
    if (!card.finishOptions.includes(finish)) {
      throw new Error('Invalid Riftbound finish.');
    }

    if (body.delta !== 1 && body.delta !== -1) {
      throw new Error('Inventory changes must be +1 or -1.');
    }

    const { data, error } = await getSupabaseServiceClient()
      .rpc('adjust_riftbound_inventory', {
        p_user_id: userId,
        p_card_id: cardId,
        p_finish: finish,
        p_delta: body.delta,
      })
      .maybeSingle<InventoryRow>();

    if (error) throw error;
    return NextResponse.json({ item: data ?? null });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
