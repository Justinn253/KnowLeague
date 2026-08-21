import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse, type NextRequest } from 'next/server';
import { GENERATED_CATALOG_CACHE_CONTROL } from '@/lib/cache-control';
import { getAnswerList, getSkinCatalog } from '@/lib/catalogs';
import { getSkinThemeAndSkinAnswerList, getSkinThemeAnswerList } from '@/lib/skin-themes';

export const GET = withApiMetrics('/api/skin-champion/quiz-answers', async function GET(request: NextRequest) {
  const answerMode = request.nextUrl.searchParams.get('answerMode');
  const catalog = getSkinCatalog();

  if (answerMode === 'skin-line') {
    return NextResponse.json(getSkinThemeAnswerList(catalog), {
      headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
    });
  }

  if (answerMode === 'skin-line-and-skin') {
    return NextResponse.json(getSkinThemeAndSkinAnswerList(catalog), {
      headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
    });
  }

  return NextResponse.json(getAnswerList(catalog), {
    headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
  });
});
