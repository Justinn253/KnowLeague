import { NextResponse } from 'next/server';
import { updateCarvingRevelationSettings } from '@/lib/carving-revelation';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';

type SettingsBody = {
  clientId: string;
  isPublic?: boolean;
  phaseDurationSeconds?: number | null;
  winCondition?: string;
  modifiers?: unknown;
  startingLineLengthPercent?: number;
  lineLengthIncrementPercent?: number;
};
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { code: string } }) {
  try {
    const body = await readJsonBody<SettingsBody>(request);
    return NextResponse.json(await updateCarvingRevelationSettings(
      params.code,
      requireString(body.clientId, 'clientId'),
      {
        isPublic: body.isPublic === true,
        phaseDurationSeconds: body.phaseDurationSeconds,
        winCondition: body.winCondition,
        modifiers: body.modifiers,
        startingLineLengthPercent: body.startingLineLengthPercent,
        lineLengthIncrementPercent: body.lineLengthIncrementPercent,
      },
    ));
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
