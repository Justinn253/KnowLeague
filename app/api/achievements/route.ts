import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getUserAchievements, recordAchievementEvent, resetUserAchievements } from '@/lib/achievements-server';
import { isAchievementEventName } from '@/lib/achievements';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const achievements = await getUserAchievements(userId);
    return NextResponse.json({ achievements });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<{ event?: unknown; metadata?: unknown }>(request);
    if (!isAchievementEventName(body.event)) {
      throw new Error('Achievement event is required.');
    }
    const metadata = body.metadata && typeof body.metadata === 'object'
      ? body.metadata as Record<string, unknown>
      : undefined;
    const result = await recordAchievementEvent(userId, body.event, metadata);
    return NextResponse.json(result);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await resetUserAchievements(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
