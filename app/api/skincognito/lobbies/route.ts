import { NextResponse } from 'next/server';
import { createSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';

type CreateLobbyBody = {
  clientId: string;
  selectedSkinId?: string | null;
};

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CreateLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const view = await createSkincognitoLobby({
      clientId: requireString(body.clientId, 'clientId'),
      authUserId,
      selectedSkinId: typeof body.selectedSkinId === 'string' ? body.selectedSkinId : null,
    });

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
