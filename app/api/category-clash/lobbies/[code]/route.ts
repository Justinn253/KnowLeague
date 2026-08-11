import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getCategoryClashLobby } from '@/lib/category-clash';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/category-clash/lobbies/[code]', async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getCategoryClashLobby(params.code, url.searchParams.get('clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
