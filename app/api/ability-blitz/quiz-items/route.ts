import { NextResponse } from 'next/server';
import { getAbilityCatalog } from '@/lib/catalogs';
import { shuffle } from '@/lib/quiz';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(shuffle(getAbilityCatalog()), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
