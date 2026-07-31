import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import {
  decodeRiftboundSharedDeckCursor,
  loadRiftboundSharedDecks,
  upsertRiftboundSharedDeck,
} from '@/lib/riftbound-shared-decks';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SharedDeckBody = {
  name?: unknown;
  description?: unknown;
  createdBy?: unknown;
  createdByChatColor?: unknown;
  createdByUsername?: unknown;
  createdByAvatarUrl?: unknown;
  createdAt?: unknown;
  deckCreatedAt?: unknown;
  legendCardId?: unknown;
  chosenChampionCardId?: unknown;
  cards?: unknown;
};

export async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:shared-decks',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many shared deck requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const viewerId = await getOptionalAuthenticatedUserId(request);
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit ? Number(rawLimit) : 24;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be a whole number between 1 and 50.');
    const rawCursor = url.searchParams.get('cursor');
    const cursor = decodeRiftboundSharedDeckCursor(rawCursor);
    if (rawCursor && !cursor) throw new Error('Invalid shared deck cursor.');
    const payload = await loadRiftboundSharedDecks({ limit, cursor, viewerId });
    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await getOptionalAuthenticatedUserId(request);
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:shared-deck-register',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: ownerId, limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many shared deck registrations. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;
    const body = await readJsonBody<SharedDeckBody>(request);
    const deck = await upsertRiftboundSharedDeck({
      ownerId,
      name: body.name,
      description: body.description,
      createdBy: body.createdBy,
      createdByChatColor: body.createdByChatColor,
      createdByUsername: body.createdByUsername,
      createdByAvatarUrl: body.createdByAvatarUrl,
      createdAt: body.createdAt,
      deckCreatedAt: body.deckCreatedAt,
      legendCardId: body.legendCardId,
      chosenChampionCardId: body.chosenChampionCardId,
      cards: body.cards,
    });
    return NextResponse.json({ deck }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
