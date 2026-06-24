import { NextResponse } from 'next/server';
import { promoteSkincognitoSpectator } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type PromoteBody = {
  clientId: string;
  targetPlayerId: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<PromoteBody>(request);
    const view = await promoteSkincognitoSpectator(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.targetPlayerId, 'targetPlayerId'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
