import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';

export async function GET() {
  const [target] = seededShuffle(getSkinCatalog(), dailySeed('skindle'));
  return NextResponse.json(target);
}
