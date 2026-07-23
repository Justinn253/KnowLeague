import { NextResponse } from 'next/server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PriceSnapshotRow = {
  snapshot_date: string;
  finish: 'normal' | 'foil';
  price_cents: number | null;
  currency: string;
  source: string;
  source_snapshot_at: string | null;
  capture_status: string;
  captured_at: string;
};

function getDays(searchParams: URLSearchParams) {
  const rawDays = searchParams.get('days');
  if (rawDays === null) return 30;

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('days must be a whole number between 1 and 30.');
  }

  return days;
}

export async function GET(request: Request, { params }: { params: { cardId: string } }) {
  const card = getRiftboundCardById(params.cardId);
  if (!card) return NextResponse.json({ error: 'Riftbound card not found.' }, { status: 404 });

  try {
    const url = new URL(request.url);
    let days: number;
    try {
      days = getDays(url.searchParams);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid history range.' }, { status: 400 });
    }
    const finish = url.searchParams.get('finish');
    if (finish !== null && finish !== 'normal' && finish !== 'foil') {
      return NextResponse.json({ error: 'finish must be normal or foil.' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - ((days - 1) * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    let query = getSupabaseServiceClient()
      .from('riftbound_card_price_snapshots')
      .select('snapshot_date, finish, price_cents, currency, source, source_snapshot_at, capture_status, captured_at')
      .eq('card_id', card.id)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: true })
      .order('finish', { ascending: true });

    if (finish) query = query.eq('finish', finish);

    const { data, error } = await query.returns<PriceSnapshotRow[]>();
    if (error) throw error;

    const response = NextResponse.json({
      cardId: card.id,
      days,
      history: (data ?? []).map((row) => ({
        date: row.snapshot_date,
        finish: row.finish,
        price: row.price_cents === null ? null : row.price_cents / 100,
        priceCents: row.price_cents,
        currency: row.currency,
        source: row.source,
        sourceSnapshotAt: row.source_snapshot_at,
        captureStatus: row.capture_status,
        capturedAt: row.captured_at,
      })),
    });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load Riftbound price history.' }, { status: 500 });
  }
}
