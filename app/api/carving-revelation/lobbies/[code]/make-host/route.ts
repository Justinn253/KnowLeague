import { NextResponse } from 'next/server';
import { transferCarvingRevelationHost } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type MakeHostBody = { clientId: string; targetPlayerId: string };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
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
}
