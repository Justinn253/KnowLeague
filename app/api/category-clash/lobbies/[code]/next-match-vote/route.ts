import { NextResponse } from 'next/server';
import { voteForNextCategoryClashMatch } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type VoteBody = {
  clientId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<VoteBody>(request);
    return NextResponse.json(await voteForNextCategoryClashMatch(
      params.code,
      requireString(body.clientId, 'clientId'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
