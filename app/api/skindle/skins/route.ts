import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { GENERATED_CATALOG_CACHE_CONTROL } from '@/lib/cache-control';
import { getSkinCatalog } from '@/lib/catalogs';

export const GET = withApiMetrics('/api/skindle/skins', async function GET() {
  return NextResponse.json(getSkinCatalog(), {
    headers: {
      'Cache-Control': GENERATED_CATALOG_CACHE_CONTROL,
    },
  });
});
