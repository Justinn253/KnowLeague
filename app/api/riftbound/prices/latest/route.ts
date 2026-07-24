import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LatestSnapshotDateRow = {
  snapshot_date: string;
};

type LatestSnapshotRow = {
  card_id: string;
  finish: 'normal' | 'foil';
  price_cents: number | null;
  source_snapshot_at: string | null;
  captured_at: string;
};

export async function GET() {
  try {
    const supabase = getSupabaseServiceClient();
    const { data: latestDateRow, error: latestDateError } = await supabase
      .from('riftbound_card_price_snapshots')
      .select('snapshot_date')
      .eq('source', 'tcgcsv')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle<LatestSnapshotDateRow>();

    if (latestDateError) throw latestDateError;

    if (!latestDateRow) {
      const response = NextResponse.json({ snapshotDate: null, sourceSnapshotAt: null, prices: {} });
      response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=900');
      return response;
    }

    const { data, error } = await supabase
      .from('riftbound_card_price_snapshots')
      .select('card_id, finish, price_cents, source_snapshot_at, captured_at')
      .eq('source', 'tcgcsv')
      .eq('snapshot_date', latestDateRow.snapshot_date)
      .returns<LatestSnapshotRow[]>();

    if (error) throw error;

    const prices: Record<string, {
      normal: number | null;
      foil: number | null;
      updatedAt: string | null;
    }> = {};
    let sourceSnapshotAt: string | null = null;
    let capturedAt: string | null = null;

    (data ?? []).forEach((row) => {
      const current = prices[row.card_id] ?? { normal: null, foil: null, updatedAt: null };
      current[row.finish] = row.price_cents === null ? null : row.price_cents / 100;
      current.updatedAt = row.source_snapshot_at ?? row.captured_at;
      prices[row.card_id] = current;
      if (!sourceSnapshotAt && row.source_snapshot_at) sourceSnapshotAt = row.source_snapshot_at;
      if (!capturedAt || row.captured_at > capturedAt) capturedAt = row.captured_at;
    });

    const response = NextResponse.json({
      snapshotDate: latestDateRow.snapshot_date,
      sourceSnapshotAt,
      capturedAt,
      prices,
    });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=900');
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load the latest Riftbound market values.' }, { status: 500 });
  }
}
