import { NextResponse } from 'next/server';
import { getRouteErrorResponse } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CollectionHistoryRow = {
  snapshot_date: string;
  value_cents: number;
  priced_copies: number;
  total_copies: number;
};

function getDays(searchParams: URLSearchParams) {
  const rawDays = searchParams.get('days');
  if (rawDays === null) return 365;

  const days = Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error('days must be a whole number between 1 and 365.');
  }

  return days;
}

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const url = new URL(request.url);
    const days = getDays(url.searchParams);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
    const endDateValue = endDate.toISOString().slice(0, 10);
    const startDateValue = startDate.toISOString().slice(0, 10);

    const { data, error } = await getSupabaseServiceClient().rpc('get_riftbound_collection_value_history', {
      p_user_id: userId,
      p_start_date: startDateValue,
      p_end_date: endDateValue,
    }).returns<CollectionHistoryRow[]>();

    if (error) throw error;

    const rows = Array.isArray(data) ? data as unknown as CollectionHistoryRow[] : [];
    const response = NextResponse.json({
      days,
      history: rows.map((row) => ({
        date: row.snapshot_date,
        value: row.value_cents / 100,
        valueCents: row.value_cents,
        pricedCopies: row.priced_copies,
        totalCopies: row.total_copies,
      })),
    });
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return response;
  } catch (error) {
    return getRouteErrorResponse(error);
  }
}
