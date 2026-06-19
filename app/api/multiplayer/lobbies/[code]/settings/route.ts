import { NextResponse } from 'next/server';
import { updateMultiplayerQuizSettings } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SettingsBody = { clientId: string; difficulty: string; modifiers?: unknown };
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SettingsBody>(request);
    return NextResponse.json(await updateMultiplayerQuizSettings(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.difficulty, 'difficulty'),
      body.modifiers,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
