import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getUserAchievements, recordAchievementEvent, recordAchievementEvents, resetUserAchievements } from '@/lib/achievements-server';
import { isAchievementEventName } from '@/lib/achievements';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/achievements', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const achievements = await getUserAchievements(userId);
    return NextResponse.json({ achievements });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/achievements', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<{ event?: unknown; events?: unknown; metadata?: unknown; includeAchievements?: unknown }>(request);
    if (Array.isArray(body.events)) {
      const submissions = body.events.map((rawSubmission) => {
        if (!rawSubmission || typeof rawSubmission !== 'object' || Array.isArray(rawSubmission)) {
          throw new Error('Invalid achievement event submission.');
        }
        const submission = rawSubmission as { event?: unknown; metadata?: unknown };
        if (!isAchievementEventName(submission.event)) {
          throw new Error('Achievement event is required.');
        }
        const metadata = submission.metadata && typeof submission.metadata === 'object'
          ? submission.metadata as Record<string, unknown>
          : undefined;
        return { event: submission.event, metadata };
      });
      const result = await recordAchievementEvents(userId, submissions, {
        includeAchievements: body.includeAchievements === true,
        ignoreInvalidEvents: true,
      });
      return NextResponse.json(result);
    }
    if (!isAchievementEventName(body.event)) {
      throw new Error('Achievement event is required.');
    }
    const metadata = body.metadata && typeof body.metadata === 'object'
      ? body.metadata as Record<string, unknown>
      : undefined;
    const result = await recordAchievementEvent(userId, body.event, metadata, {
      includeAchievements: body.includeAchievements === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const DELETE = withApiMetrics('/api/achievements', async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    await resetUserAchievements(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
