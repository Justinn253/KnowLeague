import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { upsertRiftboundSharedDeck } from '@/lib/riftbound-shared-decks';
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
