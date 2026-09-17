import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { parseDraftHistoryInput } from '@/lib/randodraft-history';
import { randodraftShareStoreConfigured, saveRandodraftShare } from '@/lib/randodraft-share-store';

export const runtime = 'nodejs';

type ShareRequest = { id?: unknown; draft?: unknown; completedAt?: unknown };

export const POST = withApiMetrics('/api/randodraft/share', async function POST(request: Request) {
  try {
    const body = await readJsonBody(request, 32_768) as ShareRequest;
    const draft = parseDraftHistoryInput(body.draft);
    const completedAt = typeof body.completedAt === 'string' && Number.isFinite(Date.parse(body.completedAt))
      ? body.completedAt
      : new Date().toISOString();
    if (!draft) throw new ApiError(400, 'Invalid completed draft.');
    if (!randodraftShareStoreConfigured()) throw new ApiError(503, 'Share storage is unavailable.');

    const requestedId = typeof body.id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(body.id) ? body.id : null;
    const id = requestedId ?? randomBytes(12).toString('base64url');
    try {
      await saveRandodraftShare(id, { draft, completedAt });
    } catch {
      throw new ApiError(503, 'Share storage is temporarily unavailable.');
    }
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
