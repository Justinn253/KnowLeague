import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import {
  autoAssignWoodcuttingWebsiteWorkers,
  assignWoodcuttingWebsiteWorker,
  buyWoodcuttingWebsiteSaplings,
  claimWoodcuttingWebsiteRewards,
  craftWoodcuttingWebsiteAxe,
  craftWoodcuttingWebsiteUpgrade,
  getWoodcuttingDashboard,
  hireWoodcuttingWebsiteWorker,
} from '@/lib/woodcutting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WoodcuttingActionBody = {
  action?: unknown;
  axeId?: unknown;
  quantity?: unknown;
  tier?: unknown;
  workerNumber?: unknown;
  upgradeId?: unknown;
};

export const GET = withApiMetrics('/api/woodcutting', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json(await getWoodcuttingDashboard(userId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/woodcutting', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<WoodcuttingActionBody>(request, 4_096);
    let dashboard;
    if (body.action === 'claim') {
      dashboard = await claimWoodcuttingWebsiteRewards(userId);
    } else if (body.action === 'hire') {
      dashboard = await hireWoodcuttingWebsiteWorker(userId);
    } else if (body.action === 'auto-assign') {
      dashboard = await autoAssignWoodcuttingWebsiteWorkers(userId);
    } else if (body.action === 'assign' && Number.isInteger(body.workerNumber) && Number.isInteger(body.axeId) && Number.isInteger(body.tier)) {
      dashboard = await assignWoodcuttingWebsiteWorker(
        userId,
        Number(body.workerNumber),
        Number(body.axeId),
        Number(body.tier) as Parameters<typeof assignWoodcuttingWebsiteWorker>[3],
      );
    } else if (body.action === 'buy-saplings' && Number.isInteger(body.tier) && Number.isInteger(body.quantity)) {
      dashboard = await buyWoodcuttingWebsiteSaplings(userId, Number(body.tier) as Parameters<typeof buyWoodcuttingWebsiteSaplings>[1], Number(body.quantity));
    } else if (body.action === 'craft-axe' && Number.isInteger(body.tier)) {
      dashboard = await craftWoodcuttingWebsiteAxe(userId, Number(body.tier) as Parameters<typeof craftWoodcuttingWebsiteAxe>[1]);
    } else if (body.action === 'craft-upgrade' && typeof body.upgradeId === 'string' && body.upgradeId.length <= 64) {
      dashboard = await craftWoodcuttingWebsiteUpgrade(userId, body.upgradeId);
    } else {
      throw new Error('Invalid Woodcutting action.');
    }
    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
