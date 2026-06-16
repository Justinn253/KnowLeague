import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';

export async function GET() {
  const daily = seededShuffle(getSkinCatalog(), dailySeed('skin-champion')).slice(0, 50);
  return NextResponse.json(daily);
}
