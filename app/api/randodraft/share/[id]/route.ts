import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse } from '@/lib/api-utils';
import { parseDraftHistoryInput } from '@/lib/randodraft-history';
import { randodraftShareStoreConfigured, readRandodraftShare, type StoredRandodraftShare } from '@/lib/randodraft-share-store';

export const runtime = 'nodejs';

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const GET = withApiMetrics('/api/randodraft/share/[id]', async function GET(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    const id = context.params.id;
    if (!SHARE_ID_PATTERN.test(id)) throw new ApiError(404, 'Share not found.');
    if (!randodraftShareStoreConfigured()) throw new ApiError(503, 'Share storage is unavailable.');

    let stored: StoredRandodraftShare | null;
    try {
      stored = await readRandodraftShare(id);
    } catch {
      throw new ApiError(503, 'Share storage is temporarily unavailable.');
    }
    if (!stored || typeof stored.completedAt !== 'string' || !Number.isFinite(Date.parse(stored.completedAt))) {
      throw new ApiError(404, 'This Randodraft share has expired or is unavailable.');
    }
    const draft = parseDraftHistoryInput(stored.draft);
    if (!draft) throw new ApiError(404, 'This Randodraft share is invalid.');

    return NextResponse.json(
      { entry: { ...draft, completedAt: stored.completedAt } },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
