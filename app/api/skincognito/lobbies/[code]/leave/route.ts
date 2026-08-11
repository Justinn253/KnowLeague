import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { leaveSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type LeaveBody = {
  clientId: string;
  forfeit?: boolean;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/leave', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<LeaveBody>(request);
    const view = await leaveSkincognitoLobby(
      params.code,
      requireString(body.clientId, 'clientId'),
      body.forfeit === true,
    );
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
