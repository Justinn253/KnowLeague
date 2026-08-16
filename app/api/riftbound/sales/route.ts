import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { enforceApiRateLimit } from '@/lib/rate-limit';
import { loadRiftboundInventory, loadRiftboundSales } from '@/lib/riftbound-server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SaleBody = {
  items?: unknown;
  soldAt?: unknown;
  adjustmentCents?: unknown;
};

type SaleRpcRow = {
  sale_id: string;
};

function parseSaleDate(value: unknown) {
  const dateValue = value === undefined || value === null || value === ''
    ? new Date().toISOString().slice(0, 10)
    : value;
  if (typeof dateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error('Sold date must use a valid YYYY-MM-DD date.');
  }
  const parsed = new Date(`${dateValue}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateValue) {
    throw new Error('Sold date must use a valid YYYY-MM-DD date.');
  }
  return dateValue;
}

function parseAdjustmentCents(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -100_000_000 || value > 100_000_000) {
    throw new Error('Discount or upcharge must be a whole number of cents between -one million and one million dollars.');
  }
  return value;
}

function parseAcquisitionDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Acquisition date must use a valid YYYY-MM-DD date.');
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Acquisition date must use a valid YYYY-MM-DD date.');
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

function parseSaleItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error('A sale must contain between one and 500 card rows.');
  }

  const keys = new Set<string>();
  return value.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object') throw new Error(`Invalid sale item at index ${index}.`);
    const item = rawItem as Record<string, unknown>;
    const cardId = requireString(item.cardId, `items[${index}].cardId`);
    const card = getRiftboundCardById(cardId);
    if (!card) throw new Error('Riftbound card not found.');
    const finish = item.finish ?? card.defaultFinish;
    if (finish !== 'normal' && finish !== 'foil') throw new Error('Invalid sale finish.');
    if (!card.finishOptions.includes(finish)) throw new Error('Invalid sale finish.');
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error('Sale quantities must be whole numbers from 1 to 1000.');
    }
    const salePriceCents = item.salePriceCents;
    if (typeof salePriceCents !== 'number' || !Number.isInteger(salePriceCents) || salePriceCents < 0 || salePriceCents > 100_000_000) {
      throw new Error('Sale prices must be whole numbers of cents from zero to one million dollars.');
    }
    const key = `${cardId}:${finish}`;
    if (keys.has(key)) throw new Error('A sale cannot contain duplicate card and finish rows.');
    keys.add(key);
    return {
      cardId,
      finish,
      quantity,
      salePriceCents,
      acquisitionDate: parseAcquisitionDate(item.acquisitionDate),
      acquisitionCostCents: parseAcquisitionCostCents(item.acquisitionCostCents),
    };
  });
}

export const GET = withApiMetrics('/api/riftbound/sales', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json({ sales: await loadRiftboundSales(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/riftbound/sales', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:sale-write',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 120, windowMs: 60 * 60_000 },
      errorMessage: 'Too many sale updates. Please wait a moment before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readJsonBody<SaleBody>(request);
    const items = parseSaleItems(body.items);
    const soldAt = parseSaleDate(body.soldAt);
    const adjustmentCents = parseAdjustmentCents(body.adjustmentCents);
    const { data, error } = await getSupabaseServiceClient()
      .rpc('complete_riftbound_sale', {
        p_user_id: userId,
        p_items: items,
        p_sold_at: soldAt,
        p_adjustment_cents: adjustmentCents,
      })
      .returns<SaleRpcRow[]>();
    if (error) throw error;
    const saleRows = data as unknown as SaleRpcRow[];
    const saleId = saleRows?.[0]?.sale_id;
    if (!saleId) throw new Error('Unable to finalize this sale.');

    const sales = await loadRiftboundSales(userId);
    const sale = sales.find((candidate) => candidate.id === saleId);
    if (!sale) throw new Error('The sale was finalized but its receipt could not be loaded.');
    return NextResponse.json({ sale, items: await loadRiftboundInventory(userId) }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
