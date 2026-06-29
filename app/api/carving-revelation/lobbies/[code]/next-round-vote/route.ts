import { NextResponse } from 'next/server';
import { voteForNextCarvingRevelationRound } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type NextRoundVoteBody = { clientId: string };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<NextRoundVoteBody>(request);
    return NextResponse.json(await voteForNextCarvingRevelationRound(
      params.code,
      requireString(body.clientId, 'clientId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
