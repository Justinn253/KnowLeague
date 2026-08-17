import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { loadRiftboundPriceHistorySnapshotRows } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PriceHistoryEntry = {
  date: string;
  finish: 'normal' | 'foil';
  price: number | null;
  priceCents: number | null;
  lowPrice: number | null;
  lowPriceCents: number | null;
  highPrice: number | null;
  highPriceCents: number | null;
  currency: string;
  source: string;
  sourceSnapshotAt: string | null;
  captureStatus: string;
  capturedAt: string;
  granularity?: 'month';
};

function getDays(searchParams: URLSearchParams) {
  const rawDays = searchParams.get('days');
  if (rawDays === null) return 30;

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('days must be a whole number between 1 and 365.');
  }

  return days;
}

function getHistoryGranularity(days: number) {
  return days > 90 ? 'month' as const : 'day' as const;
}

function getMonthlyPricePeaks(history: PriceHistoryEntry[]) {
  const monthlyPeaks = new Map<string, PriceHistoryEntry>();

  history.forEach((entry) => {
    const month = `${entry.date.slice(0, 7)}-01`;
    const key = `${month}:${entry.finish}`;
    const existing = monthlyPeaks.get(key);
    if (
      !existing
      || (entry.price !== null && (existing.price === null || entry.price > existing.price))
    ) {
      monthlyPeaks.set(key, { ...entry, date: month, granularity: 'month' });
    }
  });

  return Array.from(monthlyPeaks.values()).sort((left, right) => (
    left.date.localeCompare(right.date) || left.finish.localeCompare(right.finish)
  ));
}

export const GET = withApiMetrics('/api/riftbound/prices/[cardId]', async function GET(request: Request, { params }: { params: { cardId: string } }) {
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

    const cutoffDate = new Date(Date.now() - ((days - 1) * 24 * 60 * 60 * 1000));
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const data = await loadRiftboundPriceHistorySnapshotRows(
      card.id,
      cutoff,
      finish === 'normal' || finish === 'foil' ? finish : undefined,
    );

    const granularity = getHistoryGranularity(days);
    const dailyHistory: PriceHistoryEntry[] = (data ?? []).map((row) => ({
      date: row.snapshot_date,
      finish: row.finish,
      price: row.price_cents === null ? null : row.price_cents / 100,
      priceCents: row.price_cents,
      lowPrice: row.low_price_cents === null ? null : row.low_price_cents / 100,
      lowPriceCents: row.low_price_cents,
      highPrice: row.high_price_cents === null ? null : row.high_price_cents / 100,
      highPriceCents: row.high_price_cents,
      currency: row.currency,
      source: row.source,
      sourceSnapshotAt: row.source_snapshot_at,
      captureStatus: row.capture_status,
      capturedAt: row.captured_at,
      ...(granularity === 'month' ? { granularity: 'month' as const } : {}),
    }));
    const history = granularity === 'month' ? getMonthlyPricePeaks(dailyHistory) : dailyHistory;
    const response = NextResponse.json({
      cardId: card.id,
      days,
      granularity,
      history,
    });
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load Riftbound price history.' }, { status: 500 });
  }
});
