import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  equipFishingWebsiteUpgrade,
  getFishingDashboard,
  purchaseFishingWebsiteUpgrade,
  startFishingWebsiteExpedition,
} from '@/lib/fishing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FishingActionBody = {
  action?: unknown;
  biomeId?: unknown;
  crewSlot?: unknown;
  durationTier?: unknown;
  upgradeId?: unknown;
};

export const GET = withApiMetrics('/api/fishing', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json(await getFishingDashboard(userId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/fishing', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<FishingActionBody>(request, 4_096);
    let dashboard;
    if (
      body.action === 'start'
      && typeof body.biomeId === 'string'
      && body.biomeId.length <= 64
      && Number.isInteger(body.durationTier)
      && (body.crewSlot === undefined || Number.isInteger(body.crewSlot))
    ) {
      dashboard = await startFishingWebsiteExpedition(
        userId,
        body.biomeId as Parameters<typeof startFishingWebsiteExpedition>[1],
        Number(body.durationTier) as Parameters<typeof startFishingWebsiteExpedition>[2],
        body.crewSlot === undefined ? undefined : Number(body.crewSlot),
      );
    } else if (body.action === 'purchase' && typeof body.upgradeId === 'string' && body.upgradeId.length <= 64) {
      dashboard = await purchaseFishingWebsiteUpgrade(userId, body.upgradeId);
    } else if (body.action === 'equip' && typeof body.upgradeId === 'string' && body.upgradeId.length <= 64) {
      dashboard = await equipFishingWebsiteUpgrade(userId, body.upgradeId);
    } else {
      throw new Error('Invalid Fishing action.');
    }
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
