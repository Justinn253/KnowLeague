import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { isRiftboundMockSetCode, type RiftboundMockSetCode } from '@/lib/riftbound-mock-opening-engine';
import {
  completeRiftboundMockWebsiteOpening,
  loadRiftboundMockOpeningWorkspace,
  openRiftboundMockWebsiteProduct,
  purchaseRiftboundMockWebsiteCart,
  type RiftboundMockCartItem,
  type RiftboundMockOpeningKind,
} from '@/lib/riftbound-mock-opening';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MockOpeningBody = {
  action?: unknown;
  cart?: unknown;
  openingId?: unknown;
  product?: unknown;
  setCode?: unknown;
};

function parseSetCode(value: unknown): RiftboundMockSetCode {
  const setCode = requireString(value, 'setCode').toUpperCase();
  if (!isRiftboundMockSetCode(setCode)) throw new Error('Choose a valid Riftbound set.');
  return setCode;
}

function parseProduct(value: unknown): RiftboundMockOpeningKind {
  if (value !== 'pack' && value !== 'box') throw new Error('Choose a mock pack or box.');
  return value;
}

function parseCart(value: unknown): RiftboundMockCartItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new ApiError(400, 'Choose at least one mock product to purchase.');
  }
  const cart = new Map<string, RiftboundMockCartItem>();
  for (const line of value) {
    if (!line || typeof line !== 'object') throw new ApiError(400, 'Choose valid mock products to purchase.');
    const setCode = parseSetCode('setCode' in line ? line.setCode : undefined);
    const productKind = parseProduct('product' in line ? line.product : undefined);
    const quantity = 'quantity' in line ? line.quantity : undefined;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 120) {
      throw new ApiError(400, 'Choose between one and 120 of each mock product.');
    }
    const key = `${setCode}:${productKind}`;
    const current = cart.get(key);
    const nextQuantity = (current?.quantity ?? 0) + quantity;
    if (nextQuantity > 120) throw new ApiError(400, 'Choose between one and 120 of each mock product.');
    cart.set(key, { setCode, productKind, quantity: nextQuantity });
  }
  return [...cart.values()];
}

export const GET = withApiMetrics('/api/riftbound/mock-opening', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json(await loadRiftboundMockOpeningWorkspace(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/riftbound/mock-opening', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:mock-opening-write',
      ip: { limit: 24, windowMs: 60_000 },
      subject: { id: userId, limit: 12, windowMs: 60_000 },
      errorMessage: 'Too many mock Riftbound actions. Please wait a moment before trying again.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<MockOpeningBody>(request);
    const action = body.action;
    if (action !== 'purchase' && action !== 'purchase-cart' && action !== 'open' && action !== 'complete') throw new Error('Choose a valid mock opening action.');

    if (action === 'complete') {
      const openingId = requireString(body.openingId, 'openingId');
      if (!/^[0-9a-f-]{36}$/i.test(openingId)) throw new Error('This mock opening is invalid.');
      await completeRiftboundMockWebsiteOpening(userId, openingId);
      return NextResponse.json({ completed: true });
    }

    if (action === 'purchase') {
      const setCode = parseSetCode(body.setCode);
      const product = parseProduct(body.product);
      const purchase = await purchaseRiftboundMockWebsiteCart(userId, [{ setCode, productKind: product, quantity: 1 }]);
      const sealedProduct = purchase.sealed_products.find((entry) => entry.set_code === setCode);
      return NextResponse.json({ purchase: { ...purchase, ...sealedProduct } });
    }
    if (action === 'purchase-cart') {
      const purchase = await purchaseRiftboundMockWebsiteCart(userId, parseCart(body.cart));
      return NextResponse.json({ purchase });
    }
    const setCode = parseSetCode(body.setCode);
    const product = parseProduct(body.product);
    return NextResponse.json(await openRiftboundMockWebsiteProduct(userId, setCode, product));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
