import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { activateCarvingRevelationPowerUp, cancelCarvingRevelationPowerUp } from '@/lib/carving-revelation';

type PowerUpBody = {
  clientId: string;
  powerUpId: string;
  cancel?: boolean;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/power-up', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<PowerUpBody>(request);
    const clientId = requireString(body.clientId, 'clientId');
    const powerUpId = requireString(body.powerUpId, 'powerUpId');
    const result = body.cancel === true
      ? await cancelCarvingRevelationPowerUp(params.code, clientId, powerUpId)
      : await activateCarvingRevelationPowerUp(params.code, clientId, powerUpId);
    return NextResponse.json(result);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
