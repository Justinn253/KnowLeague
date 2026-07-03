import { NextResponse } from 'next/server';
import { updateMultiplayerQuizSettings } from '@/lib/multiplayer-quiz';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SettingsBody = { clientId: string; difficulty: string; modifiers?: unknown; totalItems?: number; isPublic?: boolean; abilitySlots?: unknown; lobbyDescription?: unknown };
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SettingsBody>(request);
    return NextResponse.json(await updateMultiplayerQuizSettings(
      params.code,
      requireString(body.clientId, 'clientId'),
      requireString(body.difficulty, 'difficulty'),
      body.modifiers,
      Number(body.totalItems ?? 50),
      body.isPublic === true,
      body.abilitySlots,
      body.lobbyDescription,
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
