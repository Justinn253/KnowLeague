import { NextResponse } from 'next/server';
import { updateMultiplayerQuizProgress } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type ProgressBody = { clientId: string; progress: number; elapsedSeconds: number; finished?: boolean };
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<ProgressBody>(request);
    return NextResponse.json(await updateMultiplayerQuizProgress(
      params.code,
      requireString(body.clientId, 'clientId'),
      Number(body.progress),
      Number(body.elapsedSeconds),
      body.finished === true,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
