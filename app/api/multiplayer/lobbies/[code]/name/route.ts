import { NextResponse } from 'next/server';
import { updateMultiplayerQuizDisplayName } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type NameBody = { clientId: string; displayName: string };
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<NameBody>(request);
    return NextResponse.json(await updateMultiplayerQuizDisplayName(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.displayName, 'displayName'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
