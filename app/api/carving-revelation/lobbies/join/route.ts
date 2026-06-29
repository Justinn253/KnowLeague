import { NextResponse } from 'next/server';
import { joinCarvingRevelationLobby } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';

type JoinLobbyBody = { code: string; clientId: string; requirePublic?: boolean };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const view = await joinCarvingRevelationLobby(requireString(body.code, 'code'), {
      clientId: requireString(body.clientId, 'clientId'),
      authUserId,
      requirePublic: body.requirePublic === true,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
