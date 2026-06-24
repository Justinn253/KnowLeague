import { NextResponse } from 'next/server';
import { scheduleSkincognitoReturnToLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ReturnToLobbyBody = {
  clientId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ReturnToLobbyBody>(request);
    const view = await scheduleSkincognitoReturnToLobby(params.code, requireString(body.clientId, 'clientId'));

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
