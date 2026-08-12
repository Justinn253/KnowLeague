import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getOptionalAuthenticatedUser } from '@/lib/auth-server';
import { canAccessModeration, getAuthenticatedAppRole } from '@/lib/moderation';
import { getRiftboundCardById } from '@/lib/riftbound';
import {
  decodeRiftboundFeedCursor,
  loadRiftboundCommunityFeed,
  normalizeRiftboundPostSort,
} from '@/lib/riftbound-community';
import { RIFTBOUND_POST_TYPES, type RiftboundCommunityPostType } from '@/lib/riftbound-community-types';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getOptionalBoolean(value: string | null) {
  if (value === null || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('hasSideboard must be true or false.');
}

function getOptionalCardId(value: string | null) {
  if (!value) return null;
  const card = getRiftboundCardById(value);
  if (!card) throw new Error('Riftbound filter card not found.');
  return card.id;
}

export const GET = withApiMetrics('/api/riftbound/community/feed', async function GET(request: Request) {
  try {
    const rateLimitResponse = await enforceApiRateLimit(request, {
      scope: 'riftbound:community-feed',
      ip: { limit: 120, windowMs: 60_000 },
      errorMessage: 'Too many community feed requests. Please try again shortly.',
    });
    if (rateLimitResponse) return rateLimitResponse;

    const viewer = await getOptionalAuthenticatedUser(request);
    const viewerId = viewer?.id ?? null;
    const includeArchived = viewer ? canAccessModeration(await getAuthenticatedAppRole(viewer)) : false;
    const url = new URL(request.url);
    const cursorValue = url.searchParams.get('cursor');
    const cursor = decodeRiftboundFeedCursor(cursorValue);
    if (cursorValue && !cursor) throw new Error('Invalid community feed cursor.');
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit ? Number(rawLimit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be a whole number between 1 and 50.');
    const rawPostType = url.searchParams.get('type');
    if (rawPostType && !RIFTBOUND_POST_TYPES.includes(rawPostType as RiftboundCommunityPostType)) throw new Error('Invalid Riftbound post type filter.');

    const payload = await loadRiftboundCommunityFeed({
      sort: normalizeRiftboundPostSort(url.searchParams.get('sort')),
      limit,
      cursor,
      viewerId,
      postType: rawPostType,
      setCode: url.searchParams.get('set')?.trim().slice(0, 20) || null,
      legendCardId: getOptionalCardId(url.searchParams.get('legend')),
      championCardId: getOptionalCardId(url.searchParams.get('champion')),
      battlefieldCardId: getOptionalCardId(url.searchParams.get('battlefield')),
      unitCardId: getOptionalCardId(url.searchParams.get('unit')),
      hasSideboard: getOptionalBoolean(url.searchParams.get('sideboard')),
      includeArchived,
    });
    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', viewerId
      ? 'private, max-age=15, stale-while-revalidate=30'
      : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('Vary', 'Authorization');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
