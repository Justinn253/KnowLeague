import { NextResponse } from 'next/server';
import { getAnswerList, getSkinCatalog } from '@/lib/catalogs';

export async function GET() {
  return NextResponse.json(getAnswerList(getSkinCatalog()));
}
