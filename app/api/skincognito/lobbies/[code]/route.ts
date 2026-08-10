import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getSkincognitoLobby } from '@/lib/skincognito';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/skincognito/lobbies/[code]', async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const url = new URL(request.url);
    const view = await getSkincognitoLobby(params.code, url.searchParams.get('clientId'));
    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
