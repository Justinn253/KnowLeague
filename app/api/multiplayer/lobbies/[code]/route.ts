import { NextResponse } from 'next/server';
import { getMultiplayerQuizLobby } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse } from '@/lib/api-utils';

export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: { code: string } }) {
  try {
    const url = new URL(request.url);
    return NextResponse.json(await getMultiplayerQuizLobby(params.code, url.searchParams.get('clientId')));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
