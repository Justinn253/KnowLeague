import { NextResponse } from 'next/server';
import { returnMultiplayerQuizLobbyToWaiting } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ReturnToLobbyBody = {
  clientId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ReturnToLobbyBody>(request);
    return NextResponse.json(await returnMultiplayerQuizLobbyToWaiting(params.code, requireString(body.clientId, 'clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
