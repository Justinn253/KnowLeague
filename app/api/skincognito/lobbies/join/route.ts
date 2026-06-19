import { NextResponse } from 'next/server';
import { joinSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type JoinLobbyBody = {
  code: string;
  clientId: string;
  displayName: string;
  authUserId?: string | null;
  selectedSkinId?: string | null;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const view = await joinSkincognitoLobby(requireString(body.code, 'code'), {
      clientId: requireString(body.clientId, 'clientId'),
      displayName: requireString(body.displayName, 'displayName'),
      authUserId: typeof body.authUserId === 'string' ? body.authUserId : null,
      selectedSkinId: typeof body.selectedSkinId === 'string' ? body.selectedSkinId : null,
    });

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
