import { NextResponse, type NextRequest } from 'next/server';
import { getAnswerList, getSkinCatalog } from '@/lib/catalogs';
import { getSkinThemeAnswerList } from '@/lib/skin-themes';

export async function GET(request: NextRequest) {
  const answerMode = request.nextUrl.searchParams.get('answerMode');
  const catalog = getSkinCatalog();

  if (answerMode === 'skin-line') {
    return NextResponse.json(getSkinThemeAnswerList(catalog));
  }

  return NextResponse.json(getAnswerList(catalog));
}
