import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getCarvingRevelationRejoinEligibility } from '@/lib/carving-revelation';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/carving-revelation/lobbies/[code]/rejoin', async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const clientId = new URL(request.url).searchParams.get('clientId');
    if (!clientId) throw new Error('Client ID is required.');
    return NextResponse.json(await getCarvingRevelationRejoinEligibility(params.code, clientId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
