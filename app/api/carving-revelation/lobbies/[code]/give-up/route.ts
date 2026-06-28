import { NextResponse } from 'next/server';
import { giveUpCarvingRevelationMatch } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type GiveUpBody = { clientId: string };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<GiveUpBody>(request);
    return NextResponse.json(await giveUpCarvingRevelationMatch(
      params.code,
      requireString(body.clientId, 'clientId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
