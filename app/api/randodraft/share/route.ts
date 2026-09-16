import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse, readJsonBody } from '@/lib/api-utils';
import { parseDraftHistoryInput } from '@/lib/randodraft-history';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type ShareRequest = { draft?: unknown; completedAt?: unknown };

export const POST = withApiMetrics('/api/randodraft/share', async function POST(request: Request) {
  try {
    const body = await readJsonBody(request, 32_768) as ShareRequest;
    const draft = parseDraftHistoryInput(body.draft);
    const completedAt = typeof body.completedAt === 'string' && Number.isFinite(Date.parse(body.completedAt))
      ? body.completedAt
      : new Date().toISOString();
    if (!draft) throw new ApiError(400, 'Invalid completed draft.');

    const supabase = getSupabaseServiceClient();
    await supabase.rpc('prune_randodraft_shares');
    const { data, error } = await supabase
      .from('randodraft_shares')
      .insert({
        draft,
        completed_at: completedAt,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single<{ id: string }>();
    if (error) throw error;
    return NextResponse.json({ id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
