import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { submitCategoryClashAnswer } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SubmitBody = { clientId: string; guess: string };
export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/category-clash/lobbies/[code]/submit', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SubmitBody>(request);
    return NextResponse.json(await submitCategoryClashAnswer(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.guess, 'guess'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
