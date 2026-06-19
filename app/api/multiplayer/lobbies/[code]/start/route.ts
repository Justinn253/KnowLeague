import { NextResponse } from 'next/server';
import { startMultiplayerQuizLobby } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type StartBody = { clientId: string };
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<StartBody>(request);
    return NextResponse.json(await startMultiplayerQuizLobby(params.code, requireString(body.clientId, 'clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
