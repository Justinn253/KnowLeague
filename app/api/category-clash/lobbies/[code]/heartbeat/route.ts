import { NextResponse } from 'next/server';
import { heartbeatCategoryClashPlayer } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type HeartbeatBody = { clientId: string; connected?: boolean };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<HeartbeatBody>(request);
    return NextResponse.json(await heartbeatCategoryClashPlayer(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.connected !== false,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
