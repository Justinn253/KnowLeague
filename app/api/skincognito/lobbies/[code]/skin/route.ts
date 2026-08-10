import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { selectSkincognitoSkin } from '@/lib/skincognito';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SelectSkinBody = {
  clientId: string;
  skinId: string;
};

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/skin', async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SelectSkinBody>(request);
    const view = await selectSkincognitoSkin(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.skinId, 'skinId'),
    );

    return NextResponse.json(view);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
