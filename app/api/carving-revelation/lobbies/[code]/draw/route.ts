import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { drawCarvingRevealStroke } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type DrawBody = { clientId: string; points?: Array<{ x?: number; y?: number }> };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/draw', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<DrawBody>(request);
    return NextResponse.json(await drawCarvingRevealStroke(params.code, requireString(body.clientId, 'clientId'), {
      points: Array.isArray(body.points)
        ? body.points.map((point) => ({ x: Number(point.x), y: Number(point.y) }))
        : [],
    }));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
