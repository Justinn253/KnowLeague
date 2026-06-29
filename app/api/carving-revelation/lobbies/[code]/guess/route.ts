import { NextResponse } from 'next/server';
import { guessCarvingRevelationSkin } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type GuessBody = { clientId: string; guess: string };
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<GuessBody>(request);
    return NextResponse.json(await guessCarvingRevelationSkin(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.guess, 'guess'),
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
