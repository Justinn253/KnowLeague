import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getSplashScrambleSkinSolves, recordSplashScrambleSkinSolve } from '@/lib/splash-scramble-skin-solves';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { skinId: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    return NextResponse.json(await getSplashScrambleSkinSolves(params.skinId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    return NextResponse.json(await recordSplashScrambleSkinSolve(params.skinId));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
