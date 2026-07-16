import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';

export async function GET() {
  return NextResponse.json(getSkinCatalog(), {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
