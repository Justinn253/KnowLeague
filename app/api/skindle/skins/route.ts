import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';

export async function GET() {
  return NextResponse.json(getSkinCatalog());
}
