import { NextResponse } from 'next/server';
import { updateSkincognitoDisplayName } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type NameBody = {
  clientId: string;
  displayName: string;
};

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<NameBody>(request);
    const view = await updateSkincognitoDisplayName(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.displayName, 'displayName'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
