import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { loadRiftboundInventory, loadRiftboundInventoryMetadata } from '@/lib/riftbound-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';
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
  action?: unknown;
  acquisitionDate?: unknown;
  acquisitionCostCents?: unknown;
  salePriceCents?: unknown;
  changes?: unknown;
};

function isMissingInventoryBatchFunction(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === '42883' || candidate.code === 'PGRST202'
    || (typeof candidate.message === 'string' && /apply_riftbound_inventory_changes|could not find the function|does not exist/i.test(candidate.message));
}

export const GET = withApiMetrics('/api/riftbound/inventory', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const [items, metadata] = await Promise.all([
      loadRiftboundInventory(userId),
      loadRiftboundInventoryMetadata(userId),
    ]);
    return NextResponse.json({ items, metadata });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

function parseAcquisitionDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Acquisition date must use YYYY-MM-DD format.');
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Acquisition date is invalid.');
  }
  return value;
}

function parseAcquisitionCostCents(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new Error('Acquisition cost must be a whole number of cents from zero to one million dollars.');
  }
  return value;
}

function parseSalePriceCents(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000_000) {
    throw new Error('Sale price must be a whole number of cents from zero to one million dollars.');
  }
  return value;
}

export const PATCH = withApiMetrics('/api/riftbound/inventory', async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<InventoryBody>(request);
    if (body.action !== 'metadata') throw new Error('Invalid inventory action.');

    const cardId = requireString(body.cardId, 'cardId');
    const card = getRiftboundCardById(cardId);
    if (!card) throw new Error('Riftbound card not found.');
    const finish = body.finish ?? card.defaultFinish;
    if (finish !== 'normal' && finish !== 'foil') throw new Error('Invalid Riftbound finish.');
    if (!card.finishOptions.includes(finish)) throw new Error('Invalid Riftbound finish.');

    const acquisitionDate = parseAcquisitionDate(body.acquisitionDate);
    const acquisitionCostCents = parseAcquisitionCostCents(body.acquisitionCostCents);
    const salePriceCents = parseSalePriceCents(body.salePriceCents);
    const { error } = await getSupabaseServiceClient()
      .from('riftbound_inventory_metadata')
      .upsert({
        user_id: userId,
        card_id: cardId,
        finish,
        acquisition_date: acquisitionDate,
        acquisition_cost_cents: acquisitionCostCents,
        sale_price_cents: salePriceCents,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,card_id,finish' });
    if (error) throw error;

    return NextResponse.json({ metadata: await loadRiftboundInventoryMetadata(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/riftbound/inventory', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:inventory-write',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: userId, limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many inventory updates. Please wait a moment before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

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
    const { data: batchRows, error: batchError } = await supabase
      .rpc('apply_riftbound_inventory_changes', {
        p_user_id: userId,
        p_changes: changes.map(({ cardId: card_id, finish, delta }) => ({ card_id, finish, delta })),
      })
      .returns<InventoryRow[]>();

    if (!batchError) {
      return NextResponse.json({ items: batchRows ?? [] });
    }

    if (!isMissingInventoryBatchFunction(batchError)) throw batchError;

    // Compatibility path for environments that have not applied the batch
    // update migration yet. New environments use the atomic RPC above.
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
});
