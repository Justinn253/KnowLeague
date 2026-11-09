import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { parseDraftHistoryInput, type DraftHistoryEntry } from '@/lib/randodraft-history';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';
import { enforceApiRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/randodraft/history', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'randodraft:history-read',
      ip: { limit: 60, windowMs: 60_000 },
      subject: { id: userId, limit: 30, windowMs: 60_000 },
    });
    if (limited) return limited;
    const { data, error } = await getSupabaseServiceClient()
      .from('randodraft_history').select('drafts').eq('user_id', userId)
      .maybeSingle<{ drafts: DraftHistoryEntry[] }>();
    if (error) throw error;
    return NextResponse.json({ drafts: data?.drafts ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/randodraft/history', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const limited = await enforceApiRateLimit(request, {
      scope: 'randodraft:history-write',
      ip: { limit: 30, windowMs: 60_000 },
      subject: { id: userId, limit: 15, windowMs: 60_000 },
    });
    if (limited) return limited;
    const draft = parseDraftHistoryInput(await readJsonBody(request, 16_384));
    if (!draft) throw new ApiError(400, 'Invalid completed draft.');
    const { data, error } = await getSupabaseServiceClient().rpc('save_randodraft_history', {
      p_user_id: userId, p_draft: draft,
    });
    if (error) throw error;
    return NextResponse.json({ drafts: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
