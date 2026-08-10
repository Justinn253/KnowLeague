import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export const POST = withApiMetrics('/api/skincognito/lobbies/[code]/name', async function POST() {
  return NextResponse.json({ error: 'Custom multiplayer display names are no longer supported.' }, { status: 410 });
});
