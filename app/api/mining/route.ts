import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  getMiningDashboard,
  purchaseMiningWebsiteUpgrade,
  returnMiningWebsiteExpedition,
  sellMiningWebsiteResource,
  shareMiningWebsiteResult,
  startMiningWebsiteExpedition,
} from '@/lib/mining';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MiningActionBody = {
  action?: unknown;
  amount?: unknown;
  depth?: unknown;
  expeditionId?: unknown;
  resource?: unknown;
  upgradeId?: unknown;
};

export const GET = withApiMetrics('/api/mining', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json(await getMiningDashboard(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/mining', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<MiningActionBody>(request, 8_192);
    let dashboard;
    if (body.action === 'start' && Number.isInteger(body.depth)) {
      dashboard = await startMiningWebsiteExpedition(userId, Number(body.depth));
    } else if (body.action === 'return') {
      dashboard = await returnMiningWebsiteExpedition(userId);
    } else if (body.action === 'share-result' && Number.isSafeInteger(body.expeditionId)) {
      dashboard = await shareMiningWebsiteResult(userId, Number(body.expeditionId));
    } else if (body.action === 'purchase' && typeof body.upgradeId === 'string' && body.upgradeId.length <= 64) {
      dashboard = await purchaseMiningWebsiteUpgrade(userId, body.upgradeId);
    } else if (
      body.action === 'sell'
      && typeof body.resource === 'string'
      && body.resource.length <= 64
      && typeof body.amount === 'string'
      && body.amount.length <= 12
    ) {
      dashboard = await sellMiningWebsiteResource(userId, body.resource, body.amount);
    } else {
      throw new Error('Invalid Mining action.');
    }
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
