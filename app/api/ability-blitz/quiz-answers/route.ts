import { NextResponse, type NextRequest } from 'next/server';
import { getAbilityCatalog, getAnswerList, getAnswersByType } from '@/lib/catalogs';

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  const items = getAbilityCatalog();
  const answersByType = getAnswersByType(items);

  if (category) {
    return NextResponse.json(answersByType[category] ?? [], {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    });
  }

  return NextResponse.json(getAnswerList(items), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
