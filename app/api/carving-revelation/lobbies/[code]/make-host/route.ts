import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { transferCarvingRevelationHost } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type MakeHostBody = { clientId: string; targetPlayerId: string };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/make-host', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<MakeHostBody>(request);
    return NextResponse.json(await transferCarvingRevelationHost(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.targetPlayerId, 'targetPlayerId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
