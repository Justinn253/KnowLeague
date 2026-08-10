import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { startNextCategoryClashMatch } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type NextMatchBody = { clientId: string };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/category-clash/lobbies/[code]/next-match', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<NextMatchBody>(request);
    return NextResponse.json(await startNextCategoryClashMatch(params.code, requireString(body.clientId, 'clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
