import { NextResponse } from 'next/server';
import { withApiMetrics } from '@/lib/api-metrics';
import { ApiError, getRouteErrorResponse } from '@/lib/api-utils';
import { parseDraftHistoryInput } from '@/lib/randodraft-history';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type ShareRow = { id: string; draft: unknown; completed_at: string; expires_at: string };

export const GET = withApiMetrics('/api/randodraft/share/[id]', async function GET(
  _request: Request,
  context: { params: { id: string } },
) {
  try {
    const id = context.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError(404, 'Share not found.');
    }
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('randodraft_shares')
      .select('id, draft, completed_at, expires_at')
      .eq('id', id)
      .maybeSingle<ShareRow>();
    if (error) throw error;
    if (!data || Date.parse(data.expires_at) <= Date.now()) {
      if (data) await supabase.from('randodraft_shares').delete().eq('id', id);
      throw new ApiError(404, 'This Randodraft share has expired or is unavailable.');
    }
    const draft = parseDraftHistoryInput(data.draft);
    if (!draft) throw new ApiError(404, 'This Randodraft share is invalid.');
    const entry = { ...draft, completedAt: data.completed_at };
    return NextResponse.json({ entry }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});