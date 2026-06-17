import { NextResponse } from 'next/server';
import { startSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type StartLobbyBody = {
  clientId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<StartLobbyBody>(request);
    const view = await startSkincognitoLobby(params.code, requireString(body.clientId, 'clientId'));
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
