import { NextResponse, type NextRequest } from 'next/server';
import { getAbilityCatalog, getAnswerList, getAnswersByType } from '@/lib/catalogs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category');
  const items = getAbilityCatalog();
  const answersByType = getAnswersByType(items);

  if (category) {
    return NextResponse.json(answersByType[category] ?? []);
  }

  return NextResponse.json(getAnswerList(items));
}
