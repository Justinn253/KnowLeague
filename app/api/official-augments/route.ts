import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { getOptionalAuthenticatedUserId } from '@/lib/auth-server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { loadOfficialAugmentRatingsBatch } from '@/lib/augment-official-server';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const MAX_BATCH_IDS = 24;
const MAX_OFFICIAL_AUGMENT_ID_LENGTH = 150;
const MAX_BATCH_IDS_PARAMETER_LENGTH = MAX_BATCH_IDS * (MAX_OFFICIAL_AUGMENT_ID_LENGTH + 1) - 1;

export const GET = withApiMetrics('/api/official-augments', async (request: Request) => {
  try {
    const limited = await enforceApiRateLimit(request, {
      scope: 'official-augments:catalogue-read',
      ip: { limit: 60, windowMs: 60_000 },
    });
    if (limited) return limited;
    const rawIds = new URL(request.url).searchParams.get('ids') ?? '';
    if (rawIds.length > MAX_BATCH_IDS_PARAMETER_LENGTH) {
      return NextResponse.json({ error: `Choose up to ${MAX_BATCH_IDS} official augments.` }, { status: 400 });
    }
    const ids = rawIds.split(',').map((id) => id.trim()).filter(Boolean);
    if (ids.length > MAX_BATCH_IDS) {
      return NextResponse.json({ error: `Choose up to ${MAX_BATCH_IDS} official augments.` }, { status: 400 });
    }
    return NextResponse.json(
      { ratings: await loadOfficialAugmentRatingsBatch(ids, await getOptionalAuthenticatedUserId(request)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
