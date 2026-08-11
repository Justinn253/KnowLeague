import { withApiMetrics } from '@/lib/api-metrics';
import { getRiotPatchNotes } from '@/lib/riot-account-viewer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export const GET = withApiMetrics('/api/riot-account/patch-notes', async function GET() {
  const notes = await getRiotPatchNotes();
  return NextResponse.json({
    sourceUrl: 'https://www.leagueoflegends.com/en-us/news/tags/patch-notes/',
    notes,
  }, {
    headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=21600' },
  });
});
