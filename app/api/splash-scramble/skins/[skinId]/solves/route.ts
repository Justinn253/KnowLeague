import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSplashScrambleSkinSolves, recordSplashScrambleSkinSolve } from '@/lib/splash-scramble-skin-solves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { skinId: string };
};

export const GET = withApiMetrics('/api/splash-scramble/skins/[skinId]/solves', async function GET(_request: Request, { params }: RouteContext) {
  try {
    return NextResponse.json(await getSplashScrambleSkinSolves(params.skinId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/splash-scramble/skins/[skinId]/solves', async function POST(_request: Request, { params }: RouteContext) {
  try {
    return NextResponse.json(await recordSplashScrambleSkinSolve(params.skinId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
