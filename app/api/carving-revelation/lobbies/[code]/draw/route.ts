import { NextResponse } from 'next/server';
import { drawCarvingRevealStroke } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type DrawBody = { clientId: string; x1: number; y1: number; x2: number; y2: number };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<DrawBody>(request);
    return NextResponse.json(await drawCarvingRevealStroke(params.code, requireString(body.clientId, 'clientId'), {
      x1: Number(body.x1),
      y1: Number(body.y1),
      x2: Number(body.x2),
      y2: Number(body.y2),
    }));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
