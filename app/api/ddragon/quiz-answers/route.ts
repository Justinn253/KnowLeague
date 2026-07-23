import { NextResponse, type NextRequest } from 'next/server';
import { GENERATED_CATALOG_CACHE_CONTROL } from '@/lib/cache-control';
import { getAbilityCatalog, getAnswerList, getAnswersByType } from '@/lib/catalogs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  const items = getAbilityCatalog();
  const answersByType = getAnswersByType(items);

  if (category) {
    return NextResponse.json(answersByType[category] ?? [], {
      headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
    });
  }

  return NextResponse.json(getAnswerList(items), {
    headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
  });
}
