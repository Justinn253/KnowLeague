import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';
import { shuffle } from '@/lib/quiz';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(shuffle(getSkinCatalog()).slice(0, 50), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
