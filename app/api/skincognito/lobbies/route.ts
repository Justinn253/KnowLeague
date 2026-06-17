import { NextResponse } from 'next/server';
import { createSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type CreateLobbyBody = {
  clientId: string;
  displayName: string;
  selectedSkinId?: string | null;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const view = await createSkincognitoLobby({
      clientId: requireString(body.clientId, 'clientId'),
      displayName: requireString(body.displayName, 'displayName'),
      selectedSkinId: typeof body.selectedSkinId === 'string' ? body.selectedSkinId : null,
    });

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
