import { NextResponse } from 'next/server';
import { getAbilityCatalog } from '@/lib/catalogs';
import { dailySeed, seededShuffle } from '@/lib/daily-set';

export async function GET() {
  const daily = seededShuffle(getAbilityCatalog(), dailySeed('ability-blitz')).slice(0, 50);
  return NextResponse.json(daily);
}
