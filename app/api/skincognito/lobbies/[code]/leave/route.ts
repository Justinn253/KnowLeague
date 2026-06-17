import { NextResponse } from 'next/server';
import { leaveSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type LeaveBody = {
  clientId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<LeaveBody>(request);
    const view = await leaveSkincognitoLobby(params.code, requireString(body.clientId, 'clientId'));
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
