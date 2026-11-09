import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { drawCarvingRevealStroke } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import {
  CARVING_REVELATION_DRAW_MAX_BODY_BYTES,
  CARVING_REVELATION_MAX_DRAW_POINTS,
} from '@/lib/game-api-limits';

type DrawBody = { clientId: string; points?: Array<{ x?: number; y?: number }> };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/carving-revelation/lobbies/[code]/draw', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<DrawBody>(request, CARVING_REVELATION_DRAW_MAX_BODY_BYTES);
    return NextResponse.json(await drawCarvingRevealStroke(params.code, requireString(body.clientId, 'clientId'), {
      points: Array.isArray(body.points)
        ? body.points.slice(0, CARVING_REVELATION_MAX_DRAW_POINTS).map((point) => ({ x: Number(point.x), y: Number(point.y) }))
        : [],
    }));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
