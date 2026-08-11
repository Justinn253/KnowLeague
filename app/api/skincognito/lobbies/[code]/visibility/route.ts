import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { updateSkincognitoLobbyVisibility } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type VisibilityBody = { clientId: string; isPublic?: boolean; lobbyDescription?: unknown };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/visibility', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<VisibilityBody>(request);
    return NextResponse.json(await updateSkincognitoLobbyVisibility(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.isPublic === true,
      body.lobbyDescription,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
