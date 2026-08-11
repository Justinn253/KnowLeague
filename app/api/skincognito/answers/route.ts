import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { GENERATED_CATALOG_CACHE_CONTROL } from '@/lib/cache-control';
import { getSkincognitoAnswerMetadata } from '@/lib/catalogs';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/skincognito/answers', async function GET() {
  return NextResponse.json(getSkincognitoAnswerMetadata(), {
    headers: { 'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL },
  });
});
