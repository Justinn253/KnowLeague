import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { activateCarvingRevelationPowerUp } from '@/lib/carving-revelation';

type PowerUpBody = {
  clientId: string;
  powerUpId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<PowerUpBody>(request);
    return NextResponse.json(await activateCarvingRevelationPowerUp(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.powerUpId, 'powerUpId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
