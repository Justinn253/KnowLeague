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

type PriceHistoryEntry = {
  date: string;
  finish: 'normal' | 'foil';
  price: number | null;
  priceCents: number | null;
  currency: string;
  source: string;
  sourceSnapshotAt: string | null;
  captureStatus: string;
  capturedAt: string;
  granularity?: 'month';
};

function getEasternCaptureDate(value: string, fallback: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : fallback;
}

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

    const cutoff = new Date(Date.now() - ((days - 1) * 24 * 60 * 60 * 1000)).toISOString();
    let query = getSupabaseServiceClient()
      .from('riftbound_card_price_snapshots')
      .select('snapshot_date, finish, price_cents, currency, source, source_snapshot_at, capture_status, captured_at')
      .eq('card_id', card.id)
      .gte('captured_at', cutoff)
      .order('captured_at', { ascending: true })
      .order('finish', { ascending: true });

    if (finish) query = query.eq('finish', finish);

    const { data, error } = await query.returns<PriceSnapshotRow[]>();
    if (error) throw error;

    const granularity = getHistoryGranularity(days);
    const dailyHistory: PriceHistoryEntry[] = (data ?? []).map((row) => ({
      date: getEasternCaptureDate(row.captured_at, row.snapshot_date),
      finish: row.finish,
      price: row.price_cents === null ? null : row.price_cents / 100,
      priceCents: row.price_cents,
      currency: row.currency,
      source: row.source,
      sourceSnapshotAt: row.source_snapshot_at,
      captureStatus: row.capture_status,
      capturedAt: row.captured_at,
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
}
