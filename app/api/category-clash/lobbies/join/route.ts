import { NextResponse } from 'next/server';
import { joinCategoryClashLobby } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';

type JoinLobbyBody = { code: string; clientId: string; requirePublic?: boolean };
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<JoinLobbyBody>(request);
    const authUserId = await getOptionalAuthenticatedUserId(request);
    const view = await joinCategoryClashLobby(requireString(body.code, 'code'), {
      clientId: requireString(body.clientId, 'clientId'),
      authUserId,
      requirePublic: body.requirePublic === true,
    });
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
