import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import {
  getPlaceholderMultiplayerPlayerCounts,
  isMultiplayerPlayerCountsEnabled,
  type MultiplayerPlayerCountsPayload,
} from '@/lib/multiplayer-player-counts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiMetrics('/api/multiplayer/player-counts', async function GET() {
  const enabled = isMultiplayerPlayerCountsEnabled();
  const payload: MultiplayerPlayerCountsPayload = {
    enabled,
    placeholder: true,
    updatedAt: new Date().toISOString(),
    counts: enabled ? getPlaceholderMultiplayerPlayerCounts() : {},
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
});
