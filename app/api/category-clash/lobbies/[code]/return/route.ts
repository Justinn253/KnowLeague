import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { returnCategoryClashLobbyToWaiting } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ReturnToLobbyBody = { clientId: string };

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/category-clash/lobbies/[code]/return', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ReturnToLobbyBody>(request);
    return NextResponse.json(await returnCategoryClashLobbyToWaiting(params.code, requireString(body.clientId, 'clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
