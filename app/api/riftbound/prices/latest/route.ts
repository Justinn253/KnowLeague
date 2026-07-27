import { NextResponse } from 'next/server';
import { loadLatestRiftboundPrices } from '@/lib/riftbound-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = NextResponse.json(await loadLatestRiftboundPrices());
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=900');
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to load the latest Riftbound market values.' }, { status: 500 });
  }
}
