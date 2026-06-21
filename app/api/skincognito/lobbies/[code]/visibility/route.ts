import { NextResponse } from 'next/server';
import { updateSkincognitoLobbyVisibility } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type VisibilityBody = { clientId: string; isPublic?: boolean };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<VisibilityBody>(request);
    return NextResponse.json(await updateSkincognitoLobbyVisibility(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.isPublic === true,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
