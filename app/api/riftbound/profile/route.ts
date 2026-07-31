import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundProfileUsername, loadRiftboundProfile, updateRiftboundProfilePreference } from '@/lib/riftbound-community';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type PreferenceBody = {
  action?: unknown;
  cardId?: unknown;
  sourceId?: unknown;
  enabled?: unknown;
  desiredQuantity?: unknown;
  note?: unknown;
  cardIds?: unknown;
  visibility?: unknown;
  about?: unknown;
};

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const username = await getRiftboundProfileUsername(userId);
    const profile = await loadRiftboundProfile(username, userId);
    const response = NextResponse.json({ profile });
    response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:profile-preferences',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: userId, limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many Riftbound profile changes. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    await updateRiftboundProfilePreference(userId, await readJsonBody<PreferenceBody>(request));
    return NextResponse.json({ saved: true });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
