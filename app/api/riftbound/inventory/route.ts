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

type InventoryChangeInput = {
  cardId?: unknown;
  finish?: unknown;
  delta?: unknown;
};

type InventoryBody = InventoryChangeInput & {
  changes?: unknown;
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
    const rawChanges = Array.isArray(body.changes)
      ? body.changes
      : [{ cardId: body.cardId, finish: body.finish, delta: body.delta }];

    if (rawChanges.length === 0) {
      throw new Error('At least one inventory change is required.');
    }

    if (rawChanges.length > 5000) {
      throw new Error('Too many inventory changes in one request.');
    }

    const changes = rawChanges.map((rawChange, index) => {
      if (!rawChange || typeof rawChange !== 'object') {
        throw new Error(`Invalid inventory change at index ${index}.`);
      }

      const change = rawChange as InventoryChangeInput;
      const cardId = requireString(change.cardId, `changes[${index}].cardId`);
      const card = getRiftboundCardById(cardId);
      if (!card) throw new Error('Riftbound card not found.');

      const finishValue = change.finish ?? card.defaultFinish;
      if (finishValue !== 'normal' && finishValue !== 'foil') {
        throw new Error('Invalid Riftbound finish.');
      }

      if (!card.finishOptions.includes(finishValue)) {
        throw new Error('Invalid Riftbound finish.');
      }

      if (typeof change.delta !== 'number' || !Number.isInteger(change.delta) || change.delta === 0 || Math.abs(change.delta) > 1000) {
        throw new Error('Inventory changes must be non-zero whole numbers no larger than 1000.');
      }

      return { cardId, finish: finishValue as 'normal' | 'foil', delta: change.delta };
    });

    const supabase = getSupabaseServiceClient();
    const { data: currentRows, error: currentRowsError } = await supabase
      .from('riftbound_inventory')
      .select('card_id, finish, quantity, updated_at')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .returns<InventoryRow[]>();

    if (currentRowsError) throw currentRowsError;

    const nextRowsByKey = new Map(
      (currentRows ?? []).map((row) => [
        `${row.card_id}:${row.finish}`,
        { ...row },
      ]),
    );

    for (const change of changes) {
      const key = `${change.cardId}:${change.finish}`;
      const currentRow = nextRowsByKey.get(key);
      const nextQuantity = (currentRow?.quantity ?? 0) + change.delta;

      if (nextQuantity <= 0) {
        nextRowsByKey.delete(key);
        continue;
      }

      nextRowsByKey.set(key, {
        card_id: change.cardId,
        finish: change.finish,
        quantity: nextQuantity,
        updated_at: new Date().toISOString(),
      });
    }

    const nextRows = Array.from(nextRowsByKey.values());
    const nextKeys = new Set(nextRows.map((row) => `${row.card_id}:${row.finish}`));
    const removedRows = (currentRows ?? []).filter((row) => !nextKeys.has(`${row.card_id}:${row.finish}`));

    if (removedRows.length > 0) {
      const deleteResults = await Promise.all(removedRows.map((row) => supabase
        .from('riftbound_inventory')
        .delete()
        .eq('user_id', userId)
        .eq('card_id', row.card_id)
        .eq('finish', row.finish)));
      const deleteError = deleteResults.find((result) => result.error)?.error;
      if (deleteError) throw deleteError;
    }

    if (nextRows.length > 0) {
      const { error } = await supabase
        .from('riftbound_inventory')
        .upsert(nextRows.map((row) => ({
          user_id: userId,
          card_id: row.card_id,
          finish: row.finish,
          quantity: row.quantity,
          updated_at: row.updated_at,
        })), { onConflict: 'user_id,card_id,finish' });
      if (error) throw error;
    }

    const { data, error } = await supabase
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
