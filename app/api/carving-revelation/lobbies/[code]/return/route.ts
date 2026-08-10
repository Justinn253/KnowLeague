import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { returnCarvingRevelationToLobby } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ReturnBody = { clientId: string };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/return', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ReturnBody>(request);
    return NextResponse.json(await returnCarvingRevelationToLobby(
      params.code,
      requireString(body.clientId, 'clientId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
