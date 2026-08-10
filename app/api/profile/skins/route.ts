import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getSkinCatalog } from '@/lib/catalogs';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/profile/skins', async function GET() {
  const skins = getSkinCatalog().map((skin) => ({
    id: skin.id,
    name: skin.answer,
    champion: skin.champion,
    skinLine: skin.skinLine ?? null,
    imageUrl: skin.imageUrl,
  }));

  return NextResponse.json(skins, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
});
