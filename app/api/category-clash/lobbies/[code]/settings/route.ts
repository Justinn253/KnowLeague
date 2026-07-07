import { NextResponse } from 'next/server';
import { updateCategoryClashSettings } from '@/lib/category-clash';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SettingsBody = {
  clientId: string;
  isPublic?: boolean;
  gameMode?: unknown;
  enabledCategoryIds?: unknown;
  roundSeconds?: unknown;
  intermissionSeconds?: unknown;
  timerDecrementInterval?: unknown;
  maxStrikes?: unknown;
  lobbyDescription?: unknown;
};
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SettingsBody>(request);
    return NextResponse.json(await updateCategoryClashSettings(
      params.code,
      requireString(body.clientId, 'clientId'),
      {
        isPublic: body.isPublic === true,
        gameMode: body.gameMode,
        enabledCategoryIds: body.enabledCategoryIds,
        roundSeconds: body.roundSeconds,
        intermissionSeconds: body.intermissionSeconds,
        timerDecrementInterval: body.timerDecrementInterval,
        maxStrikes: body.maxStrikes,
        lobbyDescription: body.lobbyDescription,
      },
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
